const BbPromise = require('bluebird')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const path = require('path')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')

BbPromise.longStackTraces()
chai.use(sinonChai)
chai.use(chaiAsPromised)

const { expect, assert } = chai

// eslint-disable-next-line import/no-dynamic-require
const func = require(path.join('..', '..', '..', 'lib', 'gcf', 'func.js'))

describe('./lib/gcf/funcHandle.js', () => {
  describe(':impl', () => {
    describe('#createUnhandledRejectionHandler', () => {
      it('should print to the console', () => {
        const callback = sinon.stub()
        const error = sinon.stub()
        func.handle.impl.createUnhandledRejectionHandler(callback, error)(new Error('tag'))
        expect(error).to.have.been.calledOnce
      })
      it('should call the callback', () => {
        const callback = sinon.stub()
        const error = sinon.stub()
        func.handle.impl.createUnhandledRejectionHandler(callback, error)(new Error('tag'))
        expect(callback).to.have.been.calledOnce
      })
    })
    describe('#handleTimeout', () => {
      it('should print to the console', () => {
        const callback = sinon.stub()
        const error = sinon.stub()
        func.handle.impl.handleTimeout(callback, error)
        expect(error).to.have.been.calledOnce
      })
      it('should call the callback', () => {
        const callback = sinon.stub()
        const error = sinon.stub()
        func.handle.impl.handleTimeout(callback, error)
        expect(callback).to.have.been.calledOnce
      })
    })
    describe('#addMetadataToInput', () => {
      const { addMetadataToInput } = func.handle.impl
      it('should return a new object with the function name metadata', () => {
        const input = { foo: 'bar' }
        const context = { functionName: 'baz' }
        const output = addMetadataToInput(input, context)
        assert.notStrictEqual(input, output)
        assert.deepStrictEqual(output, { foo: 'bar', _funcAws: { functionName: 'baz' } })
      })
    })
    describe('#createHandler', () => {
      const { createHandler } = func.handle.impl
      const readTimeout = () => Promise.resolve(300000) // 300 seconds =>5 min
      const functionName = 'loadGenerator'
      const getFunctionName = () => functionName
      it('should capture an unhandled rejection', () => {
        const mergeAndInvoke = sinon.stub().returns(BbPromise.delay(20))
        const handleTimeout = sinon.stub().callsFake(resolve =>
          resolve('reasons'))
        const unhandledException = new Error('reasons')
        const addMetadataToInput = input => input
        setTimeout(() => Promise.reject(unhandledException), 10)
        return new Promise((resolve, reject) => {
          const createUnhandledRejectionHandler = sinon.stub().callsFake(resolveTask =>
            (ex) => {
              try {
                assert.strictEqual(ex, unhandledException)
                resolveTask()
                resolve()
              } catch (err) {
                reject(err)
              }
            })
          const response = {json: (obj) => resolve(obj)}
          const entry = createHandler(
            { createUnhandledRejectionHandler, handleTimeout, mergeAndInvoke, addMetadataToInput, readTimeout,
              getFunctionName })()
          entry({}, response)
        })
      })
      it('should time out', () => {
        const { createUnhandledRejectionHandler } = func.handle.impl
        const addMetadataToInput = input => input
        const mergeAndInvoke = sinon.stub()
          .returns(new Promise(resolve => setTimeout(resolve, 20)))
        const handleTimeout = sinon.stub().callsFake(resolve =>
          resolve('reasons'))
        const readTimeoutForTimeout = () => Promise.resolve(20) //millis
        return new Promise((resolve, reject) => {
          const entry = createHandler(
            {
              createUnhandledRejectionHandler, handleTimeout, mergeAndInvoke, addMetadataToInput,
              readTimeout: readTimeoutForTimeout, getFunctionName
            },
            10
          )()
          const responseTimeout = { json: (obj) => resolve(obj)}
          entry({body: '{}' }, responseTimeout)
        })
          .then(result => assert.strictEqual(result, 'reasons'))
      })
      it('should invoke the handler', () => {
        const { createUnhandledRejectionHandler, handleTimeout } = func.handle.impl
        const addMetadataToInput = input => input
        const answer = {'body': 'value'}
        const mergeAndInvoke = sinon.stub().returns(Promise.resolve(answer))
        const taskHandler = () => {}
        const input = {}
        return new Promise((resolve, reject) => {
          const entry = createHandler(
            {
              createUnhandledRejectionHandler, handleTimeout, mergeAndInvoke, addMetadataToInput, readTimeout,
              getFunctionName
            }
          )(taskHandler)
          const response = {json: (obj) => resolve(obj)}
          entry(input, response)
        })
          .then((result) => {
            assert.strictEqual(result, answer)
            assert.isOk(mergeAndInvoke.calledWithExactly(taskHandler, input.body))
          })
      })
      it('should return a message on handler error', () => {
        const { createUnhandledRejectionHandler, handleTimeout } = func.handle.impl
        const addMetadataToInput = input => input
        const mergeAndInvoke = sinon.stub()
          .returns(Promise.reject(new Error('reasons')))
        const context = { getRemainingTimeInMillis: () => 60000 }
        const input = {}
        return new Promise((resolve, reject) => {
          const entry = createHandler(
            {
              createUnhandledRejectionHandler, handleTimeout, mergeAndInvoke, addMetadataToInput,
              readTimeout, getFunctionName
            }
          )()
          const response = {json: (obj) => resolve(obj)}
          entry(input, response)
        })
          .then(result =>
            assert.strictEqual(result, 'Error executing handler: reasons'))
      })
      it('should add metadata to input', () => {
        const { createUnhandledRejectionHandler, handleTimeout } = func.handle.impl
        const answer = {}
        const inputWithMetadata = { _funcAws: { functionName: 'foo' } }
        const mergeAndInvoke = sinon.stub().returns(Promise.resolve(answer))
        const addMetadataToInputFake = sinon.stub().callsFake(() => inputWithMetadata)
        const taskHandler = () => {}
        const input = {'body': 'value'}
        const context = {
          'functionName': functionName
        }
        return new Promise((resolve, reject) => {
          const entry = createHandler(
            {
              createUnhandledRejectionHandler, handleTimeout, mergeAndInvoke,
              addMetadataToInput: addMetadataToInputFake, readTimeout, getFunctionName
            }
          )(taskHandler)
          const response = {json: (obj) => resolve(obj)}
          entry(input, response)
        })
          .then(() => {
            assert.isOk(addMetadataToInputFake.calledWithExactly(input.body, context))
            assert.isOk(mergeAndInvoke.calledWithExactly(taskHandler, inputWithMetadata))
          })
      })
    })
    describe('#mergeIf', () => {
      const { mergeIf } = func.handle.impl
      it('should read the designated merge file', () => {
        const readMergeFile = sinon.stub().returns(Promise.resolve({}))
        return mergeIf({ '>>': 'foo' }, readMergeFile)
          .then(() => assert.isOk(readMergeFile.calledWithExactly('foo')))
      })
      it('should merge objects with a root merge attribute', () => {
        const input = {
          '>>': './lib/gcf/foo',
          mode: 'mon',
          foo: {
            bar: '3',
          },
        }
        const readMergeFile = sinon.stub().returns(Promise.resolve({
          foo: {
            bar: '1',
            baz: '2',
          },
        }))
        const expected = {
          foo: {
            bar: '3',
            baz: '2',
          },
          mode: 'mon',
        }
        return mergeIf(input, readMergeFile)
          .then(event => assert.deepStrictEqual(event, expected))
      })
    })
    describe('#mergeAndInvoke', () => {
      const { mergeAndInvoke } = func.handle.impl
      it('should call the given taskHandler with the given event', () => {
        const taskHandler = sinon.stub().returns(Promise.resolve())
        const event = {}
        const mergeIf = () => Promise.resolve(event)
        return mergeAndInvoke(taskHandler, event, mergeIf)
          .then(() => assert.isOk(taskHandler.calledWithExactly(event)))
      })
      it('should handle exceptions from the task handler and reports an error', () => {
        const taskHandler = sinon.stub()
          .returns(Promise.reject(new Error('reasons')))
        const event = {}
        const mergeIf = () => Promise.resolve(event)
        const expected = 'Error executing task: reasons'
        return mergeAndInvoke(taskHandler, event, mergeIf, sinon.stub())
          .then(result => assert.strictEqual(result, expected))
      })
      it('should handle merge exceptions and reports an error', () => {
        const taskHandler = sinon.stub().returns(Promise.resolve())
        const event = {}
        const mergeIf = () => Promise.reject(new Error('reasons'))
        const expected = 'Error validating event: reasons'
        return mergeAndInvoke(taskHandler, event, mergeIf, sinon.stub())
          .then(result => assert.strictEqual(result, expected))
      })
    })
    describe('#getMergeFilePath', () => {
      const { getMergeFilePath } = func.handle.impl
      it('should fail for missing path', () =>
        assert.isRejected(
          getMergeFilePath(),
          "'undefined' is not a valid path."
        )
      )
      it('should fail for non-string path', () =>
        assert.isRejected(
          getMergeFilePath({ foo: 'bar' }),
          "'object' is not a valid path."
        )
      )
      it('should fail for non-local absolute path', () =>
        assert.isRejected(
          getMergeFilePath('/foo', undefined, '/bar'),
          'Merge file /foo is not a local file path.'
        )
      )
      it('should fail for non-local relative path', () =>
        assert.isRejected(
          getMergeFilePath('../foo', () => '/foo', '/bar'),
          'Merge file /foo is not a local file path.'
        )
      )
      it('should succeed for absolute local path', () =>
        assert.isFulfilled(
          getMergeFilePath('/foo/bar', undefined, '/foo'),
          '/foo/bar'
        )
      )
      it('should succeed for relative local path', () =>
        assert.isFulfilled(
          getMergeFilePath('bar', p => `/foo/${p}`, '/foo'),
          '/foo/bar'
        )
      )
    })
    describe('#readTimeout', () => {
      const {readTimeout} = func.handle.impl
      it('should read value from serverless.yml', () => {
        return readTimeout(path.join('lib', 'gcf')).then(result => assert.deepEqual(result, 300000))
      })
    })

    describe('#readMergeFile', () => {
      const { readMergeFile } = func.handle.impl
      const getMergeFilePath = sinon.stub().callsFake(p => Promise.resolve(p))
      it('should get the merge file path before reading', () => {
        const readFile = sinon.stub().returns(Promise.resolve('bar'))
        return readMergeFile('foo', readFile, sinon.stub(), getMergeFilePath)
          .then(() => getMergeFilePath.calledWithExactly('foo'))
      })
      it('should log error with a bad merge file path', () => {
        const readFile = sinon.stub().returns(Promise.resolve('bar'))
        const log = sinon.stub()
        return readMergeFile('../foo', readFile, log)
          .catch(err => err)
          .then(err =>
            log.calledWithExactly(
              'Failed to read merge file.',
              '../foo',
              err.stack
            )
          )
      })
      it('should log error with a failed read', () => {
        const readFile = sinon.stub()
          .callsFake(() => Promise.reject(new Error('reasons')))
        const log = sinon.stub()
        return readMergeFile('../foo', readFile, log)
          .catch(err => err)
          .then(err =>
            log.calledWithExactly(
              'Failed to read merge file.',
              '../foo',
              err.stack
            )
          )
      })
      it('should parse yml', () => {
        const readFile = sinon.stub().returns(Promise.resolve('bar: baz'))
        const log = sinon.stub()
        return readMergeFile('foo', readFile, log, getMergeFilePath)
          .then(data => assert.deepStrictEqual(data, { bar: 'baz' }))
      })
      it('should parse json', () => {
        const readFile = sinon.stub().returns(Promise.resolve('{"bar": "baz"}'))
        const log = sinon.stub()
        return readMergeFile('foo', readFile, log, getMergeFilePath)
          .then(data => assert.deepStrictEqual(data, { bar: 'baz' }))
      })
    })
  })
})