# IDDB Wrapper

## Overview

A wrapper for the IndexedDB API that simplifies every process to work with it.

- Work with specific tables easily
- Auto-increment key or set manually
- and more to explore

## How it Works

This works like a normal wrapper. It still follows the IndexedDB Web API, but makes the process easier for you to use.

## Installation and Usage

### 1. Include the script

Use jsDelivr CDN or add the file manually to your project:

```html
<script src="https://cdn.jsdelivr.net/gh/rezzvy/iddb-wrapper@latest/dist/iddb-wrapper.min.js"></script>
```

### 2. Create a database instance

```javascript
const db = new IDDB_Wrapper("myDatabase");
```

### 3. Use a table and start storing data

```javascript
async function app() {
  const users = db.use("users");

  // Set data (with custom key)
  await users.set(1, { name: "Alice" });

  // Set data (auto key)
  await users.set("auto", { name: "Bob" });

  // Get data
  const user = await users.get(1);
  console.log(user); // { name: "Alice" }

  // Get all entries
  const allUsers = await users.getAll();
  console.log(allUsers);
  /*
[
  { key: 1, value: { name: "Alice" } },
  { key: 2, value: { name: "Bob" } }
]
*/
}

app();
```

## API Reference

### `new IDDB_Wrapper(databaseName: string)`

Create a new instance. You must provide a non-empty string as the database name.

### `use(tableName: string)`

Returns an object with table operations. Automatically creates the table if it doesn't exist.

#### Returns

```js
{
  set(key, value), get(key), delete(key), getAll(), clear();
}
```

| Method     | Description                                                    |
| ---------- | -------------------------------------------------------------- |
| `set()`    | Adds or updates a record. Use `"auto"` or `null` for auto key. |
| `get()`    | Retrieves a record by key.                                     |
| `delete()` | Removes a record by key.                                       |
| `getAll()` | Returns an array of all records with their keys.               |
| `clear()`  | Deletes all records from the table.                            |

---

### `drop(tableName: string): Promise<void>`

Permanently deletes the given table (object store) from the database.

```js
await db.drop("users");
```

### `export(config?): Promise<string | void>`

Exports the entire database into a JSON string. Optionally triggers a file download.

#### Parameters:

```ts
config?: {
  filename?: string; // default: "db_backup"
  download?: boolean; // default: true
}
```

#### Example (download JSON):

```js
await db.export(); // downloads "db_backup.json"
```

#### Example (get as string):

```js
const json = await db.export({ download: false });
console.log(json);
```

### `import(jsonString: string): Promise<void>`

Imports data from a JSON string and restores the full database structure and content.

This will **overwrite existing records** in the database.

#### Example:

```js
const backupJson = '{ "users": [ { "key": 1, "value": { "name": "Alice" } } ] }';
await db.import(backupJson);
```

## Notes

- All operations return Promises, make sure to `await` them or use `.then()`.
- Keys can be any valid IndexedDB key (string, number, Date, etc).

## Contributing

There's always room for improvement. Feel free to contribute!

## Licensing

The app is licensed under MIT License. Check the license file for more details.
