// Mock implementation of node-fetch for testing
const mockFetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: jest.fn(name => {
        if (name === 'content-type') return 'application/json';
        if (name === 'content-length') return '1000';
        return null;
      }),
    },
    text: jest.fn(() =>
      Promise.resolve(
        JSON.stringify({
          instructionTypes: {
            paragraph: {
              template: 'Write a paragraph about: {description}',
              description: 'Generate a paragraph of text',
            },
            list: {
              template: 'Create a list about: {description}',
              description: 'Generate a list',
            },
          },
        })
      )
    ),
  })
);

module.exports = mockFetch;
module.exports.default = mockFetch;
