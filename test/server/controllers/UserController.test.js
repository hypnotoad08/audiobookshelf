const { expect } = require('chai')
const sinon = require('sinon')

const UserController = require('../../../server/controllers/UserController')
const Logger = require('../../../server/Logger')

describe('UserController - delete', () => {
  beforeEach(() => {
    sinon.stub(Logger, 'error')
  })

  afterEach(() => {
    sinon.restore()
  })

  it('rejects deleting the root user by UUID', async () => {
    const rootUser = { id: 'root-uuid', isRoot: true, username: 'root' }
    const adminUser = { id: 'admin-uuid', isRoot: false, username: 'admin' }
    const fakeRes = { sendStatus: sinon.spy(), json: sinon.spy() }

    await UserController.delete({ user: adminUser, reqUser: rootUser, params: { id: rootUser.id } }, fakeRes)

    expect(fakeRes.sendStatus.calledWith(403)).to.be.true
    expect(fakeRes.json.called).to.be.false
  })
})

describe('UserController - update', () => {
  let fakeRes

  beforeEach(() => {
    fakeRes = { status: sinon.stub().returnsThis(), send: sinon.spy(), sendStatus: sinon.spy(), json: sinon.spy() }
    sinon.stub(Logger, 'error')
  })

  afterEach(() => {
    sinon.restore()
  })

  it('rejects updating extraData so client settings cannot be set through the admin route', async () => {
    const user = { id: 'user-uuid', isRoot: false, username: 'user' }
    const adminUser = { id: 'admin-uuid', isRoot: false, username: 'admin' }

    await UserController.update({ user: adminUser, reqUser: user, body: { extraData: { clientSettings: { 'abs-web-react': { a: 1 } } } } }, fakeRes)

    expect(fakeRes.status.calledWith(400)).to.be.true
    expect(fakeRes.send.calledWith('Key "extraData" cannot be updated')).to.be.true
  })
})
