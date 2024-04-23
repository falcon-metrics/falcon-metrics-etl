export const FieldMapModel = (sequelize: any, type: any) =>
    sequelize.define(
        "fieldMap",
        {
            flomatikaFieldName: {
                type: type.STRING,
                primaryKey: true,
            },
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
            datasourceFieldValue: {
                type: type.STRING,
                primaryKey: true,
            },
            flomatikaFieldValue: type.STRING,
        },
        {
            timestamps: false
        }
    );