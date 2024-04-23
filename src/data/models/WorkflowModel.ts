import { Sequelize } from 'sequelize';

export const WorkflowModel = (sequelize: Sequelize, type: any) =>
    sequelize.define(
        'workflow',
        {
            orgId: {
                type: type.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: type.STRING,
                primaryKey: true,
            },
            workflowId: {
                type: type.STRING,
                primaryKey: true,
            },
            workflowName: type.STRING,
            projectId: type.STRING,
            datasourceWorkflowId: type.STRING,
        },
        {
            timestamps: false
        }
    );