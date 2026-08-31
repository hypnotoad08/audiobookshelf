const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')
const { jsonByteLength } = require('../../../server/utils')

/**
 * Security properties of the client settings store in User.extraData.clientSettings.
 * These cover isolation from server owned extraData, isolation between client bags,
 * structural validation and persistence.
 */
describe('User client settings', () => {
  let User

  beforeEach(async () => {
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()
    await Database.sequelize.sync({ force: true })
    User = Database.userModel
  })

  afterEach(async () => {
    await Database.sequelize.close()
  })

  /**
   * @param {Object} [extraData]
   * @returns {Promise<import('../../../server/models/User')>}
   */
  async function createUser(extraData = {}) {
    return User.create({
      username: 'testuser',
      type: 'user',
      pash: 'hash',
      token: 'token',
      isActive: true,
      permissions: User.getDefaultPermissionsForUserType('user'),
      bookmarks: [],
      extraData
    })
  }

  describe('isolation from server owned extraData', () => {
    it('cannot change authOpenIDSub, oldUserId or seriesHideFromContinueListening', async () => {
      const user = await createUser({
        authOpenIDSub: 'real-sub',
        oldUserId: 'real-old-id',
        seriesHideFromContinueListening: ['series-1']
      })

      await user.updateClientSettings('abs-web-react', {
        authOpenIDSub: 'attacker-sub',
        oldUserId: 'attacker-id',
        seriesHideFromContinueListening: 'attacker-value'
      })

      expect(user.extraData.authOpenIDSub).to.equal('real-sub')
      expect(user.extraData.oldUserId).to.equal('real-old-id')
      expect(user.extraData.seriesHideFromContinueListening).to.deep.equal(['series-1'])
      // The attacker values are stored as ordinary settings inside the clients own bag
      expect(user.extraData.clientSettings['abs-web-react'].authOpenIDSub).to.equal('attacker-sub')
    })

    it('keeps other extraData keys when settings are written', async () => {
      const user = await createUser({ authOpenIDSub: 'real-sub', seriesHideFromContinueListening: ['s1'] })

      await user.updateClientSettings('abs-web-react', { bookshelfCoverSize: 160 })

      expect(user.extraData.authOpenIDSub).to.equal('real-sub')
      expect(user.extraData.seriesHideFromContinueListening).to.deep.equal(['s1'])
    })

    it('does not expose raw extraData in toOldJSONForBrowser', async () => {
      const user = await createUser({ authOpenIDSub: 'real-sub' })
      await user.updateClientSettings('abs-web-react', { bookshelfCoverSize: 160 })

      const json = user.toOldJSONForBrowser()

      expect(json).to.not.have.property('extraData')
      expect(json).to.not.have.property('authOpenIDSub')
      expect(json.clientSettings).to.deep.equal({ 'abs-web-react': { bookshelfCoverSize: 160 } })
    })
  })

  describe('isolation between clients', () => {
    it('does not modify another clients bag', async () => {
      const user = await createUser()
      await user.updateClientSettings('abs-web-react', { bookshelfCoverSize: 160 })
      await user.updateClientSettings('com.example.app', { bookshelfCoverSize: 'large' })

      expect(user.clientSettings['abs-web-react']).to.deep.equal({ bookshelfCoverSize: 160 })
      expect(user.clientSettings['com.example.app']).to.deep.equal({ bookshelfCoverSize: 'large' })
    })

    it('merges into one bag without dropping its other keys', async () => {
      const user = await createUser()
      await user.updateClientSettings('abs-web-react', { bookshelfCoverSize: 160, theme: 'dark' })
      await user.updateClientSettings('abs-web-react', { bookshelfCoverSize: 200 })

      expect(user.clientSettings['abs-web-react']).to.deep.equal({ bookshelfCoverSize: 200, theme: 'dark' })
    })

    it('removes a setting when null is sent', async () => {
      const user = await createUser()
      await user.updateClientSettings('abs-web-react', { bookshelfCoverSize: 160, theme: 'dark' })
      await user.updateClientSettings('abs-web-react', { theme: null })

      expect(user.clientSettings['abs-web-react']).to.deep.equal({ bookshelfCoverSize: 160 })
    })
  })

  describe('client id validation', () => {
    it('rejects reserved ids as reserved rather than malformed', () => {
      for (const clientId of User.unsafeObjectKeys) {
        expect(User.validateClientId(clientId), clientId).to.match(/is reserved/)
      }
    })

    it('rejects empty, oversized and malformed ids', () => {
      expect(User.validateClientId('')).to.be.a('string')
      expect(User.validateClientId(undefined)).to.be.a('string')
      expect(User.validateClientId('a'.repeat(65))).to.be.a('string')
      expect(User.validateClientId('bad id!')).to.be.a('string')
    })

    it('accepts documented id forms', () => {
      expect(User.validateClientId('abs-web-react')).to.be.null
      expect(User.validateClientId('com.example.app')).to.be.null
      expect(User.validateClientId('a'.repeat(64))).to.be.null
    })
  })

  describe('structural validation', () => {
    it('accepts arbitrary setting names so new settings need no server change', () => {
      expect(User.validateClientSettings('abs-web-react', { someBrandNewSetting: 'x' })).to.be.null
      expect(User.validateClientSettings('abs-web-react', { 'theme-mode': 'dark' })).to.be.null
    })

    it('accepts nested values up to the depth limit and rejects deeper', () => {
      expect(User.validateClientSettings('abs-web-react', { theme: { mode: 'dark', contrast: 'high' } })).to.be.null
      expect(User.validateClientSettings('abs-web-react', { a: { b: { c: 1 } } })).to.be.null
      expect(User.validateClientSettings('abs-web-react', { a: { b: { c: { d: 1 } } } })).to.be.a('string')
    })

    it('rejects a non JSON value', () => {
      expect(User.validateClientSettings('abs-web-react', { a: new Date() })).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', { a: undefined })).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', { a: NaN })).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', { a: Infinity })).to.be.a('string')
    })

    it('rejects an empty payload and invalid setting names', () => {
      expect(User.validateClientSettings('abs-web-react', {})).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', { 'bad.name': 1 })).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', { ['a'.repeat(65)]: 1 })).to.be.a('string')
    })

    it('rejects reserved setting names as reserved rather than malformed', () => {
      for (const key of User.unsafeObjectKeys) {
        expect(User.validateClientSettings('abs-web-react', { [key]: 1 }), key).to.match(/is reserved/)
        expect(User.validateClientSettings('abs-web-react', { nested: { [key]: 1 } }), `nested ${key}`).to.match(/reserved key/)
      }
    })

    it('rejects oversized payloads and values', () => {
      const limits = User.clientSettingsLimits

      expect(User.validateClientSettings('abs-web-react', { a: Array(limits.maxPayloadBytes).fill(0) })).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', { a: 'x'.repeat(limits.maxStringLength + 1) })).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', { a: Number.MAX_SAFE_INTEGER * 2 })).to.be.a('string')

      const tooManyKeys = Object.fromEntries(Array.from({ length: limits.maxKeys + 1 }, (_, i) => [`k${i}`, 1]))
      expect(User.validateClientSettings('abs-web-react', tooManyKeys)).to.be.a('string')
    })

    it('rejects a new client id once the client limit is reached', () => {
      const store = Object.fromEntries(Array.from({ length: User.clientSettingsLimits.maxClients }, (_, i) => [`client${i}`, { a: 1 }]))

      expect(User.validateClientSettings('newclient', { a: 1 }, store)).to.be.a('string')
      // A client already in the store can still write
      expect(User.validateClientSettings('client0', { b: 2 }, store)).to.be.null
    })

    it('measures sizes in utf-8 bytes rather than string length', () => {
      const maxBytes = User.clientSettingsLimits.maxStringLength

      // Same character count, but multi byte characters are 2-3x the bytes
      expect(User.validateClientSettings('abs-web-react', { a: 'x'.repeat(maxBytes) })).to.be.null
      expect(User.validateClientSettings('abs-web-react', { a: 'é'.repeat(maxBytes) })).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', { a: '中'.repeat(Math.floor(maxBytes / 3)) })).to.be.null
      expect(User.validateClientSettings('abs-web-react', { a: '中'.repeat(maxBytes) })).to.be.a('string')
    })

    it('lets every client fill its bag up to the total cap', () => {
      const limits = User.clientSettingsLimits

      // A bag just under the per client cap
      const nearCapBag = () => {
        const bag = {}
        for (let i = 0; i < 8; i++) bag[`setting${i}`] = 'x'.repeat(241)
        return bag
      }
      expect(jsonByteLength(nearCapBag())).to.be.at.most(limits.maxBytesPerClient)

      // Worst case outer overhead: every client id is the maximum length
      let store = {}
      for (let i = 0; i < limits.maxClients; i++) {
        const clientId = `client${i}`.padEnd(64, 'x')
        expect(User.validateClientSettings(clientId, nearCapBag(), store), `client ${i} was rejected`).to.be.null
        store = User.mergeClientSettings(store, clientId, nearCapBag())
      }

      expect(Object.keys(store)).to.have.lengthOf(limits.maxClients)
      expect(jsonByteLength(store)).to.be.at.most(limits.maxBytes)
    })
  })

  describe('prototype pollution', () => {
    it('rejects prototype mutating keys at the top level and when nested', () => {
      expect(User.validateClientSettings('abs-web-react', JSON.parse('{"__proto__": {"polluted": true}}'))).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', JSON.parse('{"constructor": 1}'))).to.be.a('string')
      expect(User.validateClientSettings('abs-web-react', JSON.parse('{"a": {"__proto__": {"polluted": true}}}'))).to.be.a('string')

      expect({}.polluted).to.be.undefined
    })

    it('does not pollute the prototype when merging', () => {
      const merged = User.mergeClientSettings({}, 'abs-web-react', { a: 1 })

      expect(Object.getPrototypeOf(merged)).to.equal(Object.prototype)
      expect(Object.getPrototypeOf(merged['abs-web-react'])).to.equal(Object.prototype)
      expect({}.polluted).to.be.undefined
    })
  })

  describe('persistence', () => {
    it('persists a nested extraData update', async () => {
      const user = await createUser({ authOpenIDSub: 'real-sub' })
      await user.updateClientSettings('abs-web-react', { bookshelfCoverSize: 160 })

      const reloaded = await User.findByPk(user.id)

      expect(reloaded.clientSettings['abs-web-react']).to.deep.equal({ bookshelfCoverSize: 160 })
      expect(reloaded.extraData.authOpenIDSub).to.equal('real-sub')
    })

    it('reports whether anything changed', async () => {
      const user = await createUser()

      expect(await user.updateClientSettings('abs-web-react', { bookshelfCoverSize: 160 })).to.be.true
      expect(await user.updateClientSettings('abs-web-react', { bookshelfCoverSize: 160 })).to.be.false
    })
  })
})
