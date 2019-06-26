const level = require('level');
const path = require('path');



class DStore {
    constructor(dataStoreName){
        this.cache = level(path.join(__dirname, dataStoreName),{ createIfMissing: true });
    }

    async get(key){
        try {
            const value = await this.cache.get(key);
            return Promise.resolve(value);
        } catch (error) {
            if(error.notFound) return Promise.resolve();
            return Promise.reject(error);
        }
    }

    async put(key, value){
        try {
            return Promise.resolve(await this.cache.put(key, value));
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // async del(key){
    //     try {
    //         return Promise.resolve(await this.cache.del(key));
    //     } catch (error) {
    //         return Promise.reject(error);
    //     }
    // }


}


module.exports = DStore;