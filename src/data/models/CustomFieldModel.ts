export const CustomFieldModel = (sequelize: any, type: any) =>
    sequelize.define(
        "customField",
        {
            id: {
                type: type.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            orgId: type.STRING,
            datasourceId: type.STRING,
            datasourceFieldName: type.STRING,
            datasourceFieldValue: type.STRING,
            displayName: type.STRING,
            workItemId: type.STRING,
            type: type.STRING,
        },
        {
            timestamps: false,
            indexes: [
                {
                    unique: true,
                    fields: ['orgId', 'datasourceId', 'datasourceFieldName', 'datasourceFieldValue', 'workItemId']
                },
            ]
        }
    );