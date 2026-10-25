import { Sequelize } from 'sequelize';
import colors from 'colors';
import { DATABASE_URL, DATABASE_SSL, NODE_ENV } from '../config/config.js';

export const sequelize = new Sequelize(DATABASE_URL || 'postgresql://invalid/invalid', {
  dialect: 'postgres',
  logging: false,
  pool: { max: 10, min: 0, idle: 10000 },
  dialectOptions: DATABASE_SSL ? { ssl: { require: true, rejectUnauthorized: false } } : {},
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// the database (RDS) can take a while to be ready, so we retry before giving up
export const connectDB = async ({ attempts = 10, delayMs = 3000 } = {}) => {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await sequelize.authenticate();
      await sequelize.sync();
      console.log(colors.bgGreen(`PostgreSQL connected successfully 🚀`));
      return;
    } catch (error) {
      console.error(`PostgreSQL connection failed (attempt ${attempt}/${attempts}): ${error.message}`);
      if (attempt === attempts) {
        if (NODE_ENV === 'test') throw error;
        process.exit(1);
      }
      await sleep(delayMs);
    }
  }
};
