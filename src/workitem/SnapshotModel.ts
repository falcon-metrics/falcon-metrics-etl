import { Sequelize } from 'sequelize';

export const SnapshotModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        'snapshots',
        {
            id: {
                type: type.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            workItemId: type.STRING,
            flomatikaSnapshotDate: type.DATE,

            changedDate: type.DATE,
            flomatikaCreatedBy: type.STRING,
            flomatikaCreatedDate: type.DATE,
            flomatikaWorkItemTypeId: type.STRING,
            flomatikaWorkItemTypeLevel: type.STRING,
            flomatikaWorkItemTypeName: type.STRING,
            gs2PartitionKey: type.STRING,
            gs2SortKey: type.STRING,
            isFiller: type.BOOLEAN,
            partitionKey: type.STRING,
            revision: type.INTEGER,
            sortKey: type.STRING,
            state: type.STRING,
            stateCategory: type.STRING,
            stateOrder: type.STRING,
            stateType: type.STRING,
            title: type.STRING,
            workItemType: type.STRING,

            classOfServiceId: type.STRING,
            natureOfWorkId: type.STRING,
            valueAreaId: type.STRING,
            projectId: type.STRING,
            isDelayed: type.BOOLEAN,

            stepCategory: type.STRING,
            resolution: type.STRING,
            type: type.STRING,
            assignee: type.STRING,
            blockedReason: type.STRING,
            discardedReason: type.STRING,
            flagged: type.BOOLEAN,
        },
        {
            indexes: [
                {
                    unique: true,
                    fields: [
                        'partitionKey',
                        'type',
                        'revision',
                        'workItemId',
                        'flomatikaSnapshotDate',
                    ],
                },
                {
                    unique: false,
                    fields: ['partitionKey', 'flomatikaSnapshotDate'],
                },
                {
                    unique: false,
                    fields: ['workItemId'],
                },
            ],
        },
    );
