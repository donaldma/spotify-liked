export default {
    data() {
        return {
            key: 'access_token',
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
        clearAuth(redirect = '/') {
            console.log('clearAuth')
            localStorage.removeItem(this.key)

            if(redirect) {
                location.href = redirect
            }
        },
    },
}
