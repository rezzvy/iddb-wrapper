class IDDB_Wrapper {
  #dbName;
  #db = null;
  #tables = new Map();
  #activeTable = null;

  constructor(dbName) {
    if (!dbName || typeof dbName !== "string" || dbName.trim() === "") {
      throw new Error("Database name is required and must be a non-empty string.");
    }

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

  async export(config) {
    const { filename = "db_backup", download = true } = config ?? {};
    const exportData = {};

    const request = indexedDB.open(this.#dbName);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });

    const tableNames = Array.from(db.objectStoreNames);

    for (const tableName of tableNames) {
      const tableData = await new Promise((resolve, reject) => {
        const tx = db.transaction(tableName, "readonly");
        const store = tx.objectStore(tableName);
        const items = [];
        const cursorRequest = store.openCursor();

        cursorRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            items.push({ key: cursor.key, value: cursor.value }); // 🐣 no async here
            cursor.continue();
          } else {
            resolve(items);
          }
        };

        cursorRequest.onerror = reject;
      });

      const processedData = await Promise.all(
        tableData.map(async ({ key, value }) => ({
          key,
          value: await this.#replaceBlobsWithBase64(value),
        }))
      );

      exportData[tableName] = processedData;
    }

    db.close();

    const jsonString = JSON.stringify(exportData, null, 2);

    if (download) {
      const blob = new Blob([jsonString], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename + ".json";
      a.click();

      setTimeout(() => {
        URL.revokeObjectURL(a.href);
      }, 1000);
      return;
    }

    return jsonString;
  }

  async import(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (err) {
      throw new Error("Invalid JSON format");
    }

    for (const tableName in data) {
      const db = await this.#openDBWithStore(tableName);
      await this.#clear(db, tableName);

      const tx = db.transaction(tableName, "readwrite");
      const store = tx.objectStore(tableName);

      for (const { key, value } of data[tableName]) {
        const restoredValue = await this.#restoreBlobsFromBase64(value);
        store.put(restoredValue, key);
      }

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });

      db.close();
      this.#db = null;
    }
  }

  async #restoreBlobsFromBase64(obj) {
    if (typeof obj === "string" && obj.startsWith("__BLOB__:")) {
      const base64 = obj.replace("__BLOB__:", "");
      return this.#base64ToBlob(base64);
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => this.#restoreBlobsFromBase64(item)));
    }

    if (typeof obj === "object" && obj !== null) {
      const newObj = {};
      for (const [key, value] of Object.entries(obj)) {
        newObj[key] = await this.#restoreBlobsFromBase64(value);
      }
      return newObj;
    }

    return obj;
  }

  #isBlob(value) {
    return value instanceof Blob;
  }

  #blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve("__BLOB__:" + reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  #base64ToBlob(base64String) {
    const parts = base64String.split(",");
    const match = parts[0].match(/:(.*?);/);
    const mime = match ? match[1] : "";
    const byteString = atob(parts[1]);
    const array = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      array[i] = byteString.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  }

  async #replaceBlobsWithBase64(obj) {
    if (this.#isBlob(obj)) {
      return await this.#blobToBase64(obj);
    }

    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => this.#replaceBlobsWithBase64(item)));
    }

    if (typeof obj === "object" && obj !== null) {
      const newObj = {};
      for (const [key, value] of Object.entries(obj)) {
        newObj[key] = await this.#replaceBlobsWithBase64(value);
      }
      return newObj;
    }

    return obj;
  }
}
