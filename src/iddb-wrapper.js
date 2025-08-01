class IDDB_Wrapper {
  #dbName;
  #db = null;
  #tables = new Map();
  #activeTable = null;

  constructor(dbName) {
    this.#dbName = dbName;
  }

  async #openTable(tableName) {
    if (this.#tables.has(tableName)) {
      return this.#tables.get(tableName);
    }

    const db = await this.#openDBWithStore(tableName);
    const table = {
      set: (key, value) => this.#set(db, tableName, key, value),
      get: (key) => this.#get(db, tableName, key),
      delete: (key) => this.#delete(db, tableName, key),
      getAll: () => this.#getAll(db, tableName),
      clear: () => this.#clear(db, tableName),
    };

    this.#tables.set(tableName, table);
    return table;
  }

  async #openDBWithStore(tableName) {
    if (this.#db && this.#activeTable === tableName) {
      return this.#db;
    }

    if (this.#db) {
      this.#db.close();
      this.#db = null;
      this.#activeTable = null;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.#dbName);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(tableName)) {
          db.createObjectStore(tableName, { autoIncrement: true });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        this.#db = db;
        this.#activeTable = tableName;

        if (!db.objectStoreNames.contains(tableName)) {
          db.close();
          const upgradeReq = indexedDB.open(this.#dbName, db.version + 1);

          upgradeReq.onupgradeneeded = (event) => {
            const upDb = event.target.result;
            upDb.createObjectStore(tableName, { autoIncrement: true });
          };

          upgradeReq.onsuccess = () => {
            this.#db = upgradeReq.result;
            this.#activeTable = tableName;
            resolve(this.#db);
          };

          upgradeReq.onerror = reject;
        } else {
          resolve(db);
        }
      };

      request.onerror = reject;
    });
  }

  async #set(db, tableName, key, value) {
    return new Promise((resolve, reject) => {
      const store = db.transaction(tableName, "readwrite").objectStore(tableName);

      const isAuto = key === "auto" || key === null || key === undefined || key === "";
      const req = isAuto ? store.add(value) : store.put(value, key);

      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
  }

  async #get(db, tableName, key) {
    return new Promise((resolve, reject) => {
      const store = db.transaction(tableName).objectStore(tableName);
      const req = store.get(key);

      req.onsuccess = () => {
        const value = req.result;
        if (value !== undefined) {
          resolve(value);
        } else {
          resolve(undefined);
        }
      };

      req.onerror = reject;
    });
  }

  async #getAll(db, tableName) {
    return new Promise((resolve, reject) => {
      const store = db.transaction(tableName).objectStore(tableName);
      const results = [];
      const req = store.openCursor();

      req.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor) {
          results.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      req.onerror = reject;
    });
  }

  async #delete(db, tableName, key) {
    return new Promise((resolve, reject) => {
      const store = db.transaction(tableName, "readwrite").objectStore(tableName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = reject;
    });
  }

  async #clear(db, tableName) {
    return new Promise((resolve, reject) => {
      const store = db.transaction(tableName, "readwrite").objectStore(tableName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = reject;
    });
  }

  use(tableName) {
    return {
      set: async (key, value) => {
        const table = await this.#openTable(tableName);
        return table.set(key, value);
      },
      get: async (key) => {
        const table = await this.#openTable(tableName);
        return table.get(key);
      },
      delete: async (key) => {
        const table = await this.#openTable(tableName);
        return table.delete(key);
      },
      getAll: async () => {
        const table = await this.#openTable(tableName);
        return table.getAll();
      },
      clear: async () => {
        const table = await this.#openTable(tableName);
        return table.clear();
      },
    };
  }

  async drop(tableName) {
    if (!this.#db) {
      await this.#openDBWithStore(tableName);
    }

    this.#db.close();

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.#dbName, this.#db.version + 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (db.objectStoreNames.contains(tableName)) {
          db.deleteObjectStore(tableName);
        }
      };

      request.onsuccess = () => {
        this.#db = request.result;
        this.#tables.delete(tableName);
        resolve();
      };

      request.onerror = reject;
    });
  }
}
