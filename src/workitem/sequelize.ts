import { Sequelize } from 'sequelize';
import pg from 'pg';
import { isDev } from '../utils/dev';

export const database = (host: string, password: string): Sequelize => {
    console.log('***create db connection***');
    const s = new Sequelize({
        dialect: 'postgres',
        username: 'postgres',
        password: password,
        host: host,
        port: 5432,
        database: 'postgres',
        logging: isDev ? console.log : false,
        dialectModule: pg,
    });

    return s;
};
