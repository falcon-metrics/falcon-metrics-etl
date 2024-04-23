import { Sequelize, DataTypes } from 'sequelize';

export const InsightsSnapshotsModel = (sequelize: Sequelize) =>
    sequelize.define(
        "insights_snapshot",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            orgId: {
                type: DataTypes.STRING,
                unique: 'unique_constraint_key'
                // primaryKey: true,
            },
            context_id: {
                type: DataTypes.STRING,
                unique: 'unique_constraint_key'
                // primaryKey: true,
            },
            insights_view_id: {
                type: DataTypes.INTEGER,
                unique: 'unique_constraint_key'
                // primaryKey: true,
            },
            snapshot_date: DataTypes.DATE,

            lead_time_portfolio_85: DataTypes.NUMBER,
            lead_time_85: DataTypes.NUMBER,
            flow_debt: DataTypes.NUMBER,
            flow_efficiency: DataTypes.NUMBER,
            total_throughput: DataTypes.NUMBER,
            wip_age_85: DataTypes.NUMBER,
            wip_count: DataTypes.NUMBER,
            fitness_level: DataTypes.NUMBER,
            stale_work: DataTypes.NUMBER,
            average_throughput: DataTypes.NUMBER,
            lead_time_target_met: DataTypes.NUMBER,
            quantile_first: DataTypes.NUMBER,
            quantile_second: DataTypes.NUMBER,
            quantile_third: DataTypes.NUMBER,
            quantile_fourth: DataTypes.NUMBER,
            wip_age_avg: DataTypes.NUMBER,
            lead_time_team_avg: DataTypes.NUMBER,
            lead_time_portfolio_avg: DataTypes.NUMBER,
            key_sources_of_delay: DataTypes.JSONB,
            lead_time_predictability: DataTypes.STRING,
            throughput_predictability: DataTypes.STRING,
            profile_of_work: DataTypes.JSONB,
            demand_over_capacity_percent: DataTypes.NUMBER,
            inflow_outflow_percent: DataTypes.NUMBER
        },
        {
            timestamps: false,
            indexes: [
                {
                    unique: false,
                    fields: ['orgId', 'snapshot_date']
                }
            ]
        }
    );