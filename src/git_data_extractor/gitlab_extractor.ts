import axios from 'axios';
import _ from 'lodash';
import { Logger } from 'pino';
import { Sequelize } from 'sequelize';
import {
    VCData,
    MergeRequestItem,
    VCProjectItem,
    VCSourceType,
    CommitItem,
    MergeRequestCommitItem,
    PipelineItem,
} from '../data/vc_data';
import { LogTags } from '../utils/log_tags';
import { GitDataExtractor, SecretsManager } from './common';
import { DateTime } from 'luxon';
import { sleep } from '../common/extract_utils';
import { ISqsClient } from '../notifications/sqs_client';
import { SnsClient } from '../notifications/sns_client';

export type GitlabPipeline = {
    finishedAt: string;
    updatedAt: string;
    sha?: string;
    id: string;
};

type PageInfo = {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    endCursor: string | null;
    startCursor: string | null;
};
export type GitlabCommit = {
    sha: string;
    committedDate: string;
    committerEmail: string;
    committerName: string;
};
export type GitlabCommitWithMRId = GitlabCommit & {
    mergeCommitSha: string;
    mergeRequestId: string;
};

export type GitlabMergeRequest = {
    id: string;
    iid: string;
    mergeCommitSha: string;
    title: string;
    targetBranch: string;
    sourceBranch: string;
    createdAt: string;
    mergedAt: string;
    updatedAt: string;
    commits: {
        pageInfo: PageInfo;
        nodes: GitlabCommit[];
    };
};
export type GitlabMergeRequestResponse = {
    pageInfo: PageInfo;
    nodes: GitlabMergeRequest[];
};

export class Notifier extends SnsClient {
    EXTRACT_VC_TOPIC = 'extract-vc-project';
    async notify(orgId: string, projectId: string) {
        try {
            const message = {
                orgId,
                projectId,
            };
            const snsPayload = {
                TopicArn: this.EXTRACT_VC_TOPIC,
                Message: JSON.stringify(message),
            };
            const result = await this.client.publish(snsPayload).promise();
        } catch (e) {
            this.logger.error({
                message: 'Error notifying extract of VC project',
                errorMessage: (e as Error).message,
                errorStack: (e as Error).stack,
            });
            throw e;
        }
    }
}

export class GitlabExtractor implements GitDataExtractor {
    private orgId: string;
    private logger: Logger;
    private database: Promise<Sequelize>;
    private secretsManager: SecretsManager;
    private token: string | undefined;
    private vcProjects: VCData;
    private startTime: DateTime = DateTime.now();
    private sqsClient: ISqsClient;
    private notifier: Notifier;
    /**
     * Stop extraction after this duration
     */
    private TIME_LIMIT_MINS = 10;
    EXTRACT_VC_QUEUE = 'ExtractVCDataQueue';

    constructor(opts: {
        orgId: string;
        datasourceId: string;
        datasourceType: string;
        logger: Logger;
        vcProjects: VCData;
        database: Promise<Sequelize>;
        sqsClient: ISqsClient;
        notifier: Notifier;
    }) {
        this.orgId = opts.orgId;
        this.logger = opts.logger;
        this.logger = opts.logger.child({
            orgId: this.orgId,
            tags: [LogTags.EXTRACT_GIT_DATA],
        });
        this.database = opts.database;
        this.secretsManager = new SecretsManager(opts);
        this.vcProjects = opts.vcProjects;
        this.sqsClient = opts.sqsClient;
        this.notifier = opts.notifier;
    }

    private getToken(projectId: string) {
        return this.secretsManager.getToken(
            this.orgId,
            projectId,
            VCSourceType.GITLAB,
        );
    }

    private getAxiosInstance(baseUrl: string, token: string) {
        const fullUrl = `${baseUrl}/api/graphql`;
        const axiosInstance = axios.create({
            baseURL: fullUrl,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        return axiosInstance;
    }

    private async isValidProject(project: VCProjectItem, token: string) {
        const axiosInstance = this.getAxiosInstance(project.url, token);
        const response = await axiosInstance.post('', {
            query: `
                query GetProject($projectPath:ID!) {
                    project(fullPath: $projectPath) {
                        id
                        name
                    }
                }
            `,
            variables: {
                projectPath: project.path,
            },
        });
        const { id, name } = response?.data?.data?.project ?? {};
        return id && name;
    }

    private computeUpdatedAfter(
        project: VCProjectItem,
    ): Required<VCProjectItem['nextRunStartsFrom']> {
        return {
            mergeRequests: _.max([
                project.nextRunStartsFrom.mergeRequests ??
                    DateTime.fromMillis(0),
                project.excludeBefore,
            ])!,
            pipelines: _.max([
                project.nextRunStartsFrom.pipelines ?? DateTime.fromMillis(0),
                project.excludeBefore,
            ])!,
        };
    }

    private isTimeToQuit(startTime: DateTime) {
        const now = DateTime.now();
        return now.diff(startTime, 'minutes').minutes >= this.TIME_LIMIT_MINS;
    }

    private parseCommitsFromMRNodes(nodes: GitlabMergeRequest[]) {
        const commits: GitlabCommitWithMRId[] = _.chain(nodes)
            .map(({ id, mergeCommitSha, commits: { nodes } }) =>
                nodes.map((n) => ({
                    ...n,
                    mergeCommitSha,
                    mergeRequestId: id,
                })),
            )
            .flatten()
            .value();
        return commits;
    }

    private async fetchAllCommitsOfMR(
        project: VCProjectItem,
        token: string,
        mr: GitlabMergeRequest,
        commitsCursor: string,
        startTime: DateTime,
    ) {
        const GET_COMMITS_REQUESTS = `
            query GetCommits($mrIids: [String!], $projectPath:ID!, $after: String) {
                project(fullPath: $projectPath) {
                    mergeRequests(
                        iids: $mrIids
                    ) {
                        nodes {
                            commits(after: $after) {
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                                nodes {
                                    sha
                                    committedDate
                                    committerEmail
                                    committerName
                                }
                            }
                        }
                    }
                }
            }        
        `;
        const axiosInstance = this.getAxiosInstance(project.url, token);
        let hasNextPage = true;
        let afterCursor = commitsCursor;
        let allCommits: GitlabCommitWithMRId[] = [];

        while (hasNextPage) {
            const response: any = await axiosInstance.post('', {
                query: GET_COMMITS_REQUESTS,
                variables: {
                    projectPath: project.path,
                    mrIids: [mr.iid],
                    after: afterCursor,
                },
            });
            const responseData: GitlabMergeRequestResponse =
                response?.data?.data?.project?.mergeRequests ?? {};
            const firstNode = _.first(responseData.nodes);
            const { pageInfo } = firstNode?.commits ?? {};
            afterCursor = pageInfo?.endCursor ?? '';
            hasNextPage = !!pageInfo?.hasNextPage;

            const commits: GitlabCommitWithMRId[] =
                this.parseCommitsFromMRNodes(responseData.nodes);
            allCommits = allCommits.concat(commits);
            // TODO: This is an edge case.
            // The lambda quits extracting when it hits the time limit
            // In the next invocation of ETL, it beings extraction at the next MR.
            // That means, some commits are not extracted from the current
            if (this.isTimeToQuit(startTime)) {
                this.logger.error({
                    message:
                        'Quitting early when fetching commits. Did not fetch all commits',
                    hasNextPage,
                    afterCursor,
                    project,
                    mr,
                });
                break;
            }
        }
        return allCommits;
    }

    private async fetchMergeRequests(
        project: VCProjectItem,
        token: string,
        startTime: DateTime,
    ) {
        let afterCursor = null;
        let hasNextPage = true;
        const axiosInstance = this.getAxiosInstance(project.url, token);
        const updatedAfter = this.computeUpdatedAfter(project).mergeRequests;
        const GET_MERGE_REQUESTS = `
            query GetmergeRequests($projectPath:ID!, $updatedAfter: Time, $after: String) {
                project(fullPath: $projectPath) {
                    mergeRequests(
                        state: merged
                        updatedAfter: $updatedAfter
                        after: $after
                        sort:UPDATED_ASC
                    ) {
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                        nodes {
                            id
                            iid
                            mergeCommitSha
                            title
                            targetBranch
                            sourceBranch
                            createdAt
                            updatedAt
                            mergedAt
                            commits {
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                                nodes {
                                    sha
                                    committedDate
                                    committerEmail
                                    committerName
                                }
                            }
                        }
                    }
                }
            }        
        `;

        let allMergeRequestNodes: GitlabMergeRequest[] = [];
        let allCommits: GitlabCommitWithMRId[] = [];
        const mrsCount = 0;
        const commitsCount = 0;
        let lastMR: GitlabMergeRequest | undefined;

        while (hasNextPage) {
            try {
                const response: any = await axiosInstance.post('', {
                    query: GET_MERGE_REQUESTS,
                    variables: {
                        projectPath: project.path,
                        updatedAfter: updatedAfter.toISO(),
                        after: afterCursor,
                        mainBranchName: project.mainBranchName,
                    },
                });
                const responseData: GitlabMergeRequestResponse =
                    response?.data?.data?.project?.mergeRequests ?? {};
                const nodes: GitlabMergeRequest[] = responseData.nodes ?? [];
                allMergeRequestNodes = allMergeRequestNodes.concat(nodes);

                for (const node of nodes) {
                    let mrCommits = this.parseCommitsFromMRNodes([node]);

                    // Commits pagination
                    const { endCursor, hasNextPage } = node.commits.pageInfo;
                    lastMR = node;
                    if (hasNextPage && endCursor) {
                        const remainingCommits = await this.fetchAllCommitsOfMR(
                            project,
                            token,
                            node,
                            endCursor,
                            startTime,
                        );
                        mrCommits = mrCommits.concat(remainingCommits);
                    }
                    allCommits = allCommits.concat(mrCommits);

                    if (this.isTimeToQuit(startTime)) break;
                }

                afterCursor = responseData.pageInfo.endCursor;
                hasNextPage = responseData.pageInfo.hasNextPage;

                this.logger.info({
                    message: 'Fetched a batch of MRs',
                    mrsCount: allMergeRequestNodes.length,
                    commitsCount: allCommits.length,
                });

                if (this.isTimeToQuit(startTime)) {
                    this.logger.info({
                        message: 'Quitting early',
                        project,
                    });
                    break;
                }
            } catch (error) {
                console.error(
                    'Error fetching merge requests:',
                    error?.response?.data,
                );
                break;
            }
        }
        await this.vcProjects.updateNextRunStartFrom(this.orgId, project.id, {
            mergeRequests: lastMR
                ? DateTime.fromISO(lastMR.updatedAt)
                : undefined,
        });

        return {
            mergeRequests: allMergeRequestNodes,
            commits: allCommits,
            hasMorePages: hasNextPage,
        };
    }

    private async fetchPipelines(
        project: VCProjectItem,
        token: string,
        startTime: DateTime,
    ) {
        let allPipelineNodes: GitlabPipeline[] = [];

        try {
            const GET_PIPELINES = `
                query GetPipelines(
                    $projectPath:ID!, 
                    $mainBranchName:String, 
                    $updatedAfter:Time, 
                    $before: String
                ) {
                    project(fullPath: $projectPath) {
                        pipelines(
                            status: SUCCESS, 
                            ref: $mainBranchName, 
                            updatedAfter: $updatedAfter, 
                            before: $before,
                            last:100,
                        ) {
                            nodes {
                                finishedAt
                                updatedAt
                                sha
                                id
                            }
                            pageInfo {
                                hasNextPage
                                hasPreviousPage
                                endCursor
                                startCursor
                            }
                        }
                    }
                }
            `;

            const axiosInstance = this.getAxiosInstance(project.url, token);
            const updatedAfter = this.computeUpdatedAfter(project);
            let cursor = null;
            let hasPreviousPage = true;
            let firstPipeline;
            while (hasPreviousPage) {
                const response: any = await axiosInstance.post('', {
                    query: GET_PIPELINES,
                    variables: {
                        projectPath: project.path,
                        updatedAfter: updatedAfter.pipelines.toISO(),
                        updatedBefore: updatedAfter.pipelines.toISO(),
                        after: cursor,
                        before: cursor,
                        mainBranchName: project.mainBranchName,
                    },
                });
                const responseData = response.data.data?.project?.pipelines;
                const nodes: GitlabPipeline[] = responseData?.nodes ?? [];
                allPipelineNodes = allPipelineNodes.concat(nodes);

                const pageInfo: PageInfo = responseData.pageInfo;
                cursor = pageInfo.startCursor;
                hasPreviousPage = pageInfo.hasPreviousPage;
                firstPipeline = _.first(nodes);

                this.logger.info({
                    message: 'Fetched a batch of pipelines',
                    pipelinesCount: allPipelineNodes.length,
                });

                if (this.isTimeToQuit(startTime)) break;
            }

            await this.vcProjects.updateNextRunStartFrom(
                this.orgId,
                project.id,
                {
                    pipelines: firstPipeline
                        ? DateTime.fromISO(firstPipeline.updatedAt)
                        : undefined,
                },
            );

            return {
                pipelines: allPipelineNodes,
                hasMorePages: hasPreviousPage,
            };
        } catch (error) {
            console.error('Error fetching pipelines:', error.response?.data);
            throw error;
        }
    }

    async queueProjectForExtract(orgId: string, projectId: string) {
        try {
            await this.sqsClient.sendMessageToQueue(this.EXTRACT_VC_QUEUE, {
                orgId,
                projectId,
            });
        } catch (e) {
            this.logger.error({
                message: 'Error when queuing project for extract',
                orgId,
                projectId,
            });
            throw e;
        }
    }
    async notifyForExtract(orgId: string, projectId: string) {
        try {
            await this.notifier.notify(orgId, projectId);
        } catch (e) {
            this.logger.error({
                message: 'Error when sending for VC project extract',
                orgId,
                projectId,
            });
            throw e;
        }
    }

    async extract(orgId: string, projectId: string) {
        this.orgId = orgId;
        const startTime = DateTime.now();
        const project = await this.vcProjects.getProject(
            this.orgId,
            projectId,
            VCSourceType.GITLAB,
        );
        const token = await this.getToken(projectId);
        const isValid = await this.isValidProject(project, token);

        if (!isValid) {
            this.logger.error({
                message: 'Invalid project',
                projectId,
                project,
            });
            throw new Error('Project is invalid');
        }

        const promises = [
            this.fetchMergeRequests(project, token, startTime),
            this.fetchPipelines(project, token, startTime),
        ];

        const [mergeRequestsResponse, pipelinesResponse] =
            await Promise.all(promises);

        type MRsRes = Awaited<ReturnType<typeof this.fetchMergeRequests>>;
        type PipelinesRes = Awaited<ReturnType<typeof this.fetchPipelines>>;

        const {
            mergeRequests,
            commits,
            hasMorePages: hasMoreMRs,
        } = mergeRequestsResponse as MRsRes;
        const { pipelines, hasMorePages: hasMorePipelines } =
            pipelinesResponse as PipelinesRes;

        await this.transformAndLoad(
            projectId,
            mergeRequests,
            commits,
            pipelines,
        );

        if (hasMoreMRs || hasMorePipelines) {
            // Notify may cause too many GraphQL calls exceeding the quota
            // Leaving this here. We can use it if we need it
            // await this.notifyForExtract(orgId, projectId);
            this.logger.info({
                message:
                    'There are more data to extract. Pushing this project to the queue',
                project,
            });
            await this.queueProjectForExtract(orgId, projectId);
        }
    }

    async transformAndLoad(
        projectId: string,
        mergeRequests: GitlabMergeRequest[],
        commits: GitlabCommitWithMRId[],
        pipelines: GitlabPipeline[],
    ) {
        const mrs: MergeRequestItem[] = mergeRequests.map((mr) => {
            return {
                id: mr.id,
                orgId: this.orgId,
                projectId,
                title: mr.title,
                mergeCommitSha: mr.mergeCommitSha,
                sourceBranch: mr.sourceBranch,
                targetBranch: mr.targetBranch,
                mrCreatedAt: DateTime.fromISO(mr.createdAt).toJSDate(),
                mrMergedAt: DateTime.fromISO(mr.mergedAt).toJSDate(),
            };
        });
        const commitsToInsert: CommitItem[] = commits.map((c) => {
            return {
                sha: c.sha,
                committedDate: DateTime.fromISO(c.committedDate),
                committerEmail: c.committerEmail,
                committerName: c.committerName,
                orgId: this.orgId,
                projectId,
            };
        });
        const mrCommits: MergeRequestCommitItem[] = commits.map((c) => {
            return {
                commitSha: c.sha,
                mergeRequestId: c.mergeRequestId,
                orgId: this.orgId,
                projectId,
            };
        });
        const pipelinesToInsert: PipelineItem[] = pipelines.map((p) => {
            return {
                id: p.id,
                mergeCommitSha: p.sha,
                orgId: this.orgId,
                projectId,
                finishedAt: DateTime.fromISO(p.finishedAt),
            };
        });

        await Promise.all([
            this.vcProjects.insertMergeRequests(mrs),
            this.vcProjects.insertCommits(commitsToInsert),
            this.vcProjects.insertMergeRequestCommits(mrCommits),
            this.vcProjects.insertPipelines(pipelinesToInsert),
        ]);
    }
}
