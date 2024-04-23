import { DateTime } from 'luxon';
import { ContextItem } from '../data/context_aurora';
import { JiraRawItem } from '../jiracloud/process/revision_processor';
import { ISprintProcessor } from './extract_sprints_process_interface';

export type JiraSprint = {
    id: number;
    name: string;
    state: string;

    // These fields may be undefined
    startDate?: DateTime;
    endDate?: DateTime;
    completeDate?: DateTime;
    goal?: string;
};

export type JiraBoard = {
    id: number;
    name: string;
    url: URL;
};
