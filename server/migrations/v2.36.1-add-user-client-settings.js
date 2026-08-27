/**
 * @typedef MigrationContext
 * @property {import('sequelize').QueryInterface} queryInterface - a Sequelize QueryInterface object.
 * @property {import('../Logger')} logger - a Logger object.
 *
 * @typedef MigrationOptions
 * @property {MigrationContext} context - an object containing the migration context.
 */

const migrationVersion = '2.36.1'
const migrationName = `${migrationVersion}-add-user-client-settings`
const loggerPrefix = `[${migrationVersion} migration]`

/**
 * This migration script adds a clientSettings column to the users table.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function up({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('users')) {
    const tableDescription = await queryInterface.describeTable('users')

    if (!tableDescription.clientSettings) {
      logger.info(`${loggerPrefix} Adding clientSettings column to users table`)
      await queryInterface.addColumn('users', 'clientSettings', {
        type: queryInterface.sequelize.Sequelize.DataTypes.JSON,
        allowNull: true
      })
      logger.info(`${loggerPrefix} Added clientSettings column to users table`)
    } else {
      logger.info(`${loggerPrefix} clientSettings column already exists in users table`)
    }
  } else {
    logger.info(`${loggerPrefix} users table does not exist`)
  }

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

/**
 * This migration script removes the clientSettings column from the users table.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>} - A promise that resolves when the migration is complete.
 */
async function down({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('users')) {
    const tableDescription = await queryInterface.describeTable('users')

    if (tableDescription.clientSettings) {
      logger.info(`${loggerPrefix} Removing clientSettings column from users table`)
      await queryInterface.removeColumn('users', 'clientSettings')
      logger.info(`${loggerPrefix} Removed clientSettings column from users table`)
    } else {
      logger.info(`${loggerPrefix} clientSettings column does not exist in users table`)
    }
  } else {
    logger.info(`${loggerPrefix} users table does not exist`)
  }

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

module.exports = { up, down }
