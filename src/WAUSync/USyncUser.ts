export class USyncUser {
	id?: string
	lid?: string
	username?: string
	phone?: string
	type?: string

	withId(id: string) {
		this.id = id
		return this
	}

	withLid(lid: string) {
		this.lid = lid
		return this
	}

	withPhone(phone: string) {
		this.phone = phone
		return this
	}

	withUsername(username: string) {
		this.username = username
		return this
	}

	withType(type: string) {
		this.type = type
		return this
	}
}
