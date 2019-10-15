import {JSDOM} from "jsdom"
import * as fs from "fs"
const FILES = [
    "index.html",
    "_site/index.html",
    "volunteer_positions.html",
    "_site/volunteer_positions.html",
]

function syncAll() {
    for (const filename of FILES) {
        syncFile(filename)
    }
}

async function syncFile(filename) {
    const dom = await JSDOM.fromFile(filename)
    const result = dom.serialize()
    fs.writeFileSync(filename, result)
}



syncAll()
