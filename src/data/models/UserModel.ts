import { DataTypes, Sequelize } from "sequelize";

export const UserModel = (sequelize: Sequelize) =>
    sequelize.define(
        'users',
        {
            orgId: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            userId: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            firstName: DataTypes.STRING,
            lastName: DataTypes.STRING,
            email: DataTypes.STRING,
            role: DataTypes.STRING,
        },
        {
            timestamps: false,
        },
    );
