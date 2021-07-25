export default {
    setup() {
        return {
            key: 'token',
        }
    },

    methods: {
        getAuth() {
            console.log('getAuth')
            return localStorage.getItem(this.key)
        },
        setAuth(token) {
            console.log('setAuth')
            localStorage.setItem(this.key, token)
            location.href = '/'
        },
        clearAuth() {
            console.log('clearAuth')
            localStorage.removeItem(this.key)
            location.href = '/'
        },
    },
}
