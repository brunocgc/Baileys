import { S_WHATSAPP_NET } from '../WABinary'

/**
 * Utility functions for handling LID (Local Identifier) vs JID (Jabber ID) in WhatsApp
 *
 * LID format: number@lid (e.g., 188480915300534@lid)
 * JID format: number@s.whatsapp.net (e.g., 5521987908324@s.whatsapp.net)
 */

/**
 * Determine the correct WhatsApp domain based on whether to use LID or JID
 * @param useLid - Whether to use LID format (true) or JID format (false)
 * @returns The appropriate domain string
 */
export const getWhatsAppDomain = (useLid: boolean): string => {
	return useLid ? 'lid' : S_WHATSAPP_NET
}

/**
 * Detect if an identifier is in LID format
 * @param identifier - The identifier to check (optional)
 * @returns True if the identifier contains '@lid', false otherwise
 */
export const isLidIdentifier = (identifier?: string): boolean => {
	return identifier ? identifier.includes('@lid') : false
}

/**
 * Extract the domain from an identifier
 * @param identifier - The identifier (JID or LID)
 * @returns The domain part (e.g., 'lid', 's.whatsapp.net')
 */
export const getIdentifierDomain = (identifier: string): string => {
	const parts = identifier.split('@')
	return parts.length > 1 ? parts[1] : ''
}

/**
 * Get the identifier type based on the identifier string
 * @param identifier - The identifier to analyze
 * @returns 'lid' or 'jid' based on the identifier format
 */
export const getIdentifierType = (identifier: string): 'lid' | 'jid' => {
	return isLidIdentifier(identifier) ? 'lid' : 'jid'
}

/**
 * Automatically determine if LID should be used based on an identifier
 * @param identifier - The identifier to analyze (optional)
 * @returns True if the identifier suggests LID usage
 */
export const shouldUseLid = (identifier?: string): boolean => {
	return identifier ? isLidIdentifier(identifier) : false
}

/**
 * Format an identifier with the appropriate domain
 * @param user - The user part (number)
 * @param type - Whether to format as 'lid' or 'jid'
 * @param device - Device number (for JID format, optional)
 * @returns Properly formatted identifier
 */
export const formatIdentifier = (user: string, type: 'lid' | 'jid', device = 0): string => {
	if(type === 'lid') {
		return `${user}@lid`
	} else {
		return device === 0 ? `${user}@${S_WHATSAPP_NET}` : `${user}.${device}@${S_WHATSAPP_NET}`
	}
}
