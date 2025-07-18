import AsyncLock from 'async-lock'
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { waproto } from '../../WAProto'
import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'
import logger from './logger'

// We need to lock files due to the fact that we are using async functions to read and write files
// https://github.com/WhiskeySockets/Baileys/issues/794
// https://github.com/nodejs/node/issues/26338
// Default pending is 1000, set it to infinity
// https://github.com/rogierschouten/async-lock/issues/63
const fileLock = new AsyncLock({ maxPending: Infinity })

/**
 * stores the full authentication state in a single folder.
 * Far more efficient than singlefileauthstate
 *
 * Again, I wouldn't endorse this for any production level use other than perhaps a bot.
 * Would recommend writing an auth state for use with a proper SQL or No-SQL DB
 * */
export const useMultiFileAuthState = async (folder: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
	 
	const writeData = (data: any, file: string) => {
		const filePath = join(folder, fixFileName(file)!)
		return fileLock.acquire(
			filePath,
			() => writeFile(join(filePath), JSON.stringify(data, BufferJSON.replacer))
		)
	}

	const readData = async (file: string) => {
		try {
			const filePath = join(folder, fixFileName(file)!)
			const data = await fileLock.acquire(
				filePath,
				() => readFile(filePath, { encoding: 'utf-8' })
			)
			return JSON.parse(data, BufferJSON.reviver)
		} catch(error: any) {
			if(error && (error.code === 'ENOENT' || error.errno === -4058)) {
				return null
			}

			logger.error(error, `Failed to read data from ${file} in ${folder}`)
			return null
		}
	}

	const removeData = async (file: string) => {
		try {
			const filePath = join(folder, fixFileName(file)!)
			await fileLock.acquire(
				filePath,
				() => unlink(filePath)
			)
		} catch{

		}
	}

	const folderInfo = await stat(folder).catch(() => { })
	if(folderInfo) {
		if(!folderInfo.isDirectory()) {
			throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`)
		}
	} else {
		await mkdir(folder, { recursive: true })
	}

	const fixFileName = (file?: string) => file?.replace(/\//g, '__')?.replace(/:/g, '-')

	const creds: AuthenticationCreds = await readData('creds.json') || initAuthCreds()

	return {
		state: {
			creds,
			keys: {
				get: async (type, ids) => {
					const data: { [_: string]: SignalDataTypeMap[typeof type] } = { }
					await Promise.all(
						ids.map(
							async id => {
								let value = await readData(`${type}-${id}.json`)
								if(type === 'app-state-sync-key' && value) {
									value = waproto.Message.AppStateSyncKeyData.fromObject(value)
								}

								data[id] = value
							}
						)
					)

					return data
				},
				set: async (data) => {
					const tasks: Promise<void>[] = []
					for(const category in data) {
						for(const id in data[category as keyof SignalDataTypeMap]) {
							const value = data[category as keyof SignalDataTypeMap]![id]
							const file = `${category}-${id}.json`
							tasks.push(value ? writeData(value, file) : removeData(file))
						}
					}

					await Promise.all(tasks)
				}
			}
		},
		saveCreds: () => {
			return writeData(creds, 'creds.json')
		}
	}
}
