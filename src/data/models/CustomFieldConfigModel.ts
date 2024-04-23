export const CustomFieldConfigModel = (sequelize: any, type: any) =>
    sequelize.define(
        "customFieldConfig",
        {
            orgId: {
                type: type.STRING,
                primaryKey: true,
            },
            datasourceId: {
                type: type.STRING,
                primaryKey: true,
            },
            datasourceFieldName: {
                type: type.STRING,
                primaryKey: true,
            },
            displayName: type.STRING,
            type: type.STRING,
            enabled: type.BOOLEAN,
            hidden: type.BOOLEAN,
            projectId: {
                type: type.STRING,
                primaryKey: true,
                defaultValue: 'default-value',
            },
            tags: type.STRING
        },
        {
            timestamps: false,
        }
    );