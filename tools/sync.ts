// This whole script is woefully ineficient, but
// I guess I have fundamentally picked ts-node as
// the thing to run it, so everything else is child's play
import "dotenv/config"
import {JSDOM} from "jsdom"
import * as fs from "fs"
import * as assert from "assert"
import * as url from "url"
import fetch from "node-fetch"

const FILES = [
    "index.html",
    "_site/index.html",
    "volunteer_positions.html",
    "_site/volunteer_positions.html",
]

process.on('unhandledRejection', up => { throw up })

// TODO: once this is a webapp then we can do the oauth dance
// properly. For now, let's do it manually.
assert(
    process.env.TRELLO_API_KEY && process.env.TRELLO_OAUTH_TOKEN, `
    Please go to https://trello.com/app-key and add it to your environment
    as TRELLO_API_KEY (or add a line like TRELLO_API_KEY=YOUR-KEY to a file
    called .env in this directory).
    
    Once you have done that, click "manually generate a Token" and add it
    as TRELLO_OAUTH_TOKEN.
    
    DO NOT SHARE TRELLO_OAUTH_TOKEN WITH ANYONE.`
)


async function syncAll(): Promise<void> {
    for (const filename of FILES) {
        console.log("starting", filename)
        await syncFile(filename)
        console.log("finished", filename)
    }
}

async function syncFile(filename: string): Promise<void> {
    const dom = await JSDOM.fromFile(filename)

    await syncDom(dom)

    const result = dom.serialize()
    fs.writeFileSync(filename, result)
}

async function syncDom(dom: JSDOM): Promise<void> {
    const list = dom.window.document.querySelector("ul")

    await syncList(list)
}

async function syncList(list: HTMLUListElement): Promise<void> {
    const boardUrl = list.getAttribute("data-synced-with-board")
    const listNames = list.getAttribute("data-synced-list-names")
    const projectsOnly = list.hasAttribute("data-projects-only")
    if (!listNames) {
        return
    }

    const boardId = boardUrl.replace("https://trello.com/b/", "").split("/")[0]
    list.innerHTML = ''
    let cards = await fetchAndFlatten(boardId, listNames)
    if (projectsOnly) {
        let seen = {}
        cards = cards.map(card => ({
            ...card,
            // title is of the format "position, project"
            // so throw away everything before the comma.
            name: card.name.replace(/^.*,/, ''),
            attachments: [],
        })).filter(
            // deduplicate by project name
            (item) => seen[item.name] ? false : (seen[item.name] = true)
        )
    }
    for (const card of cards) {
        list.appendChild(makeListItem(card))
    }
}

function makeListItem(card: CardWithAttachments): HTMLLIElement {
    return JSDOM.fragment(`
              <li><h3>${card.name.trim()}</h3>
              <p>${card.desc.trim()}${
                  card.attachments.map(attachment =>
                      ` <a href="${attachment.url}" target="_blank">${
                          attachment.name === attachment.url
                              ? "Continue reading"
                              : attachment.name
                      }</a>`
                  )
              }</p></li>
            `) as unknown as HTMLLIElement
}

interface CardWithAttachments {
    id: string,
    name: string,
    desc: string,
    attachments: Array<Attachment>
}
async function fetchAndFlatten(boardId, listNames): Promise<Array<CardWithAttachments>> {
    const result: Array<CardWithAttachments> = []
    for (const {id, name} of await fetchBoardLists(boardId)) {
        if (listNames.split(",").indexOf(name) !== -1) {
            const cards = await fetchListCards(id)
            for (const card of cards) {
                const attachments = await fetchCardAttachments(card.id)
                result.push({...card, attachments})
            }
        }
    }
    return result
}

interface List {
    id: string,
    name: string,
}

async function fetchBoardLists(boardId: string): Promise<Array<List>> {
    const endpoint = url.format(
        {
            ...url.parse(`https://api.trello.com/1/boards/${boardId}/lists`), 
            query: {
                cards: "none",
                filter: "open",
                fields: "id,name",
                key: process.env.TRELLO_API_KEY,
                token: process.env.TRELLO_OAUTH_TOKEN,
            }
        }
    )
    const response = await fetch(endpoint)
    return await response.json()
}

interface Card {
    id: string,
    name: string,
    desc: string,
}

async function fetchListCards(listId: string): Promise<Array<Card>> {
    const endpoint = url.format(
        {
            ...url.parse(`https://api.trello.com/1/lists/${listId}/cards`), 
            query: {
                cards: "visible",
                fields: "all",
                key: process.env.TRELLO_API_KEY,
                token: process.env.TRELLO_OAUTH_TOKEN,
            }
        }
    )
    const response = await fetch(endpoint)
    return await response.json()
}

interface Attachment {
    id: string,
    name: string,
    url: string,
}

async function fetchCardAttachments(cardId: string): Promise<Array<Attachment>> {
    const endpoint = url.format(
        {
            ...url.parse(`https://api.trello.com/1/cards/${cardId}/attachments`), 
            query: {
                fields: "all",
                key: process.env.TRELLO_API_KEY,
                token: process.env.TRELLO_OAUTH_TOKEN,
            }
        }
    )
    const response = await fetch(endpoint)
    return await response.json()
}


syncAll()
