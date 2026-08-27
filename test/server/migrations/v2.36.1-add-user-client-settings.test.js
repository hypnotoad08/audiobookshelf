const chai = require('chai')
const sinon = require('sinon')
const { expect } = chai

const { DataTypes } = require('sequelize')

const { up, down } = require('../../../server/migrations/v2.36.1-add-user-client-settings')

describe('Migration v2.36.1-add-user-client-settings', () => {
  let queryInterface, logger

  beforeEach(() => {
    queryInterface = {
      addColumn: sinon.stub().resolves(),
      removeColumn: sinon.stub().resolves(),
      tableExists: sinon.stub().resolves(true),
      describeTable: sinon.stub().resolves({ clientSettings: undefined }),
      sequelize: {
        Sequelize: {
          DataTypes: {
            JSON: DataTypes.JSON
          }
        }
      }
    }

    logger = {
      info: sinon.stub(),
      error: sinon.stub()
    }
  })

  describe('up', () => {
    it('should add the clientSettings column to users table', async () => {
      await up({ context: { queryInterface, logger } })

      expect(queryInterface.addColumn.calledOnce).to.be.true
      expect(
        queryInterface.addColumn.calledWith('users', 'clientSettings', {
          type: DataTypes.JSON,
          allowNull: true
        })
      ).to.be.true

      expect(logger.info.calledWith('[2.36.1 migration] UPGRADE BEGIN: 2.36.1-add-user-client-settings')).to.be.true
      expect(logger.info.calledWith('[2.36.1 migration] Adding clientSettings column to users table')).to.be.true
      expect(logger.info.calledWith('[2.36.1 migration] Added clientSettings column to users table')).to.be.true
      expect(logger.info.calledWith('[2.36.1 migration] UPGRADE END: 2.36.1-add-user-client-settings')).to.be.true
    })

    it('should not add the clientSettings column if it already exists', async () => {
      queryInterface.describeTable.resolves({ clientSettings: true })

      await up({ context: { queryInterface, logger } })

      expect(queryInterface.addColumn.called).to.be.false
      expect(logger.info.calledWith('[2.36.1 migration] clientSettings column already exists in users table')).to.be.true
    })

    it('should do nothing if the users table does not exist', async () => {
      queryInterface.tableExists.resolves(false)

      await up({ context: { queryInterface, logger } })

      expect(queryInterface.addColumn.called).to.be.false
      expect(logger.info.calledWith('[2.36.1 migration] users table does not exist')).to.be.true
    })
  })

  describe('down', () => {
    it('should remove the clientSettings column from users table', async () => {
      queryInterface.describeTable.resolves({ clientSettings: true })

      await down({ context: { queryInterface, logger } })

      expect(queryInterface.removeColumn.calledOnce).to.be.true
      expect(queryInterface.removeColumn.calledWith('users', 'clientSettings')).to.be.true

      expect(logger.info.calledWith('[2.36.1 migration] DOWNGRADE BEGIN: 2.36.1-add-user-client-settings')).to.be.true
      expect(logger.info.calledWith('[2.36.1 migration] Removing clientSettings column from users table')).to.be.true
      expect(logger.info.calledWith('[2.36.1 migration] Removed clientSettings column from users table')).to.be.true
      expect(logger.info.calledWith('[2.36.1 migration] DOWNGRADE END: 2.36.1-add-user-client-settings')).to.be.true
    })

    it('should not remove the clientSettings column if it does not exist', async () => {
      await down({ context: { queryInterface, logger } })

      expect(queryInterface.removeColumn.called).to.be.false
      expect(logger.info.calledWith('[2.36.1 migration] clientSettings column does not exist in users table')).to.be.true
    })
  })
})
