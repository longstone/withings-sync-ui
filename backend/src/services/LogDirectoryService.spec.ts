import {existsSync, readFileSync} from 'fs'
import {LogDirectoryService} from './LogDirectoryService'
import {format} from 'util'

jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn(),
    readFileSync: jest.fn()
}))

describe('LogDirectoryService.readRunLogs', () => {
    afterEach(() => jest.restoreAllMocks())

    it('treats format specifiers in run IDs as data when reading fails', () => {
        const error = new Error('read failed')
        const runId = 'run-%s-%d-%j'
        jest.mocked(existsSync).mockReturnValue(true)
        jest.mocked(readFileSync).mockImplementation(() => { throw error })
        const log = jest.spyOn(console, 'error').mockImplementation(() => {})

        expect(new LogDirectoryService('/tmp/test-data').readRunLogs('profile', runId)).toEqual([])
        expect(log).toHaveBeenCalledWith('Failed to read run logs for %s:', runId, error)
        expect(format(...log.mock.calls[0])).toContain(`Failed to read run logs for ${runId}:`)
    })
})
