import { DataTypes, Sequelize } from 'sequelize';

const types: typeof DataTypes = Sequelize as any;

export const ObeyaRoomModel = (sequelize: Sequelize) =>
    sequelize.define(
        'obeya_rooms',
        {
            orgId: {
                type: types.STRING,
            },
            datasourceId: {
                type: types.STRING,
            },
            roomId: {
                type: types.STRING,
                primaryKey: true,
            },
            filterId: types.STRING,
            roomName: types.STRING,
            beginDate: types.DATE,
            endDate: types.DATE,
            flomatikaQuery: types.STRING,
            parsedQuery: types.STRING,
            goal: types.STRING,
            type: types.STRING,
            includeRelated: types.BOOLEAN,
            includeChildren: types.BOOLEAN,
            includeChildrenOfRelated: types.BOOLEAN,
            includeChildrenOfChildren: types.BOOLEAN,
        },
        {
            timestamps: false,
        },
    );
