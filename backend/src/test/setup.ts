
// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.DATA_DIR = '/tmp/test-data'

// Setup test database
beforeAll(async () => {
  // Create test data directory
  const fs = require('fs')
  if (!fs.existsSync(process.env.DATA_DIR)) {
    fs.mkdirSync(process.env.DATA_DIR, { recursive: true })
  }
})

afterAll(async () => {
  // Clean up test data directory
  const fs = jest.requireActual('fs') as typeof import('fs')
  const path = jest.requireActual('path') as typeof import('path')
  
  function removeRecursive(dirPath: string) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.readdirSync(dirPath).forEach((file: string) => {
          const curPath = path.join(dirPath, file)
          if (fs.lstatSync(curPath).isDirectory()) {
            removeRecursive(curPath)
          } else {
            fs.unlinkSync(curPath)
          }
        })
        fs.rmdirSync(dirPath)
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  removeRecursive(process.env.DATA_DIR || '/tmp/test-data')
})

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks()
})
