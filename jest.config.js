module.exports = {
	'roots': [
		'<rootDir>/src'
	],
	'testMatch': [
		'**/Tests/*.test.+(ts|tsx|js)',
	],
	'transform': {
		'^.+\\.(ts|tsx)$': 'ts-jest'
	},
	moduleNameMapper: {
		'^axios$': require.resolve('axios'),
	},
}