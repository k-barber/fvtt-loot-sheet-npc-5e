import { MODULE } from '../data/moduleConstants.js';
import { Utils } from '../helper/Utils.js';
import { CurrencyHelper } from '../helper/CurrencyHelper.js';
import { ItemHelper } from '../helper/ItemHelper.js';

/**
 * Create a new LootProcessor object.
 *
 * Requires an {Actor} object and a Loot object.
 *
 */
export class LootProcessor {

    /**
     *
     * @param {Actor} actor
     * @param {Array} results
     * @param {object} options
     *
     */
    constructor(results, actor, options = {}) {
        /**
         * @type {Actor}
         */
        this.actor = actor || this._getLootActor(actor);
        this.rawResults = results;
        this.lootResults = [];
        this.currencyData = actor?.system?.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
        this.defaultConversions = {};
        this.options = options || {
            currencyString: '',
            stackSame: true,
            tokenUuid: null,
        };
        return this;
    }

    async buildResults(options = {}) {
        const currencyString = options?.customRoll.currencyFormula ?? '';
        this._setCurrencyData(await CurrencyHelper.generateCurrency(currencyString));

        if(this.rawResults && Symbol.iterator in Object(this.rawResults)){
            for (const result of this.rawResults) {
                const betterResults = await this._parseResult(result, options);

                for (const r of betterResults) {
                    this.lootResults.push(r);
                }
            }
        }

        return { results: this.lootResults, currency: this.currencyData };
    }

    /**
       *
       * @param {object} item
       * @param {object} conversions
       *
       * @returns
       */
    async buildItemData(item, conversions = null) {
        let itemData = {},
            existingItem = false;

        /** Try first to load item from compendium */

        if (item.uuid) {
            existingItem = await fromUuid(item.uuid);
        }

        if (existingItem) {
            itemData = duplicate(existingItem);
        } else if (item.collection) {
            existingItem = await Utils.getItemFromCompendium(item);
        } else {
            /** if an item with this name exist we load that item data, otherwise we create a new one */
            existingItem = game.items.getName(item.text);
        }

        if (Object.getOwnPropertyDescriptor(item, 'commands') && item.commands) {
            itemData = this._applyCommandToItemData(itemData, item.commands);
        }

        if (!itemData) return;

        itemData = await this.preItemCreationDataManipulation(itemData, existingItem);
        return itemData;
    }

    /**
     *
     * @param {boolean} ret
     * @returns {Array}
     *
     */
    async _getLootActor(ret = false) {
        if (!this.actor) {
            this.actor = await Actor.create({
                name: actorName || 'New Loot',
                type: 'npc',
                img: 'modules/better-rolltables/artwork/chest.webp',
                sort: 12000,
                token: { actorLink: true }
            });

            if (ret)
                return this.actor;
        }
    }

    /**
     * Add given currency to existing currency
     *
     * @param {Array} currencyData
     */
    _addCurrency(currencyData) {
        for (const key in currencyData) {
            this._setCurrencyData((this.currencyData[key] || 0) + currencyData[key], key);
        }
    }

    /**
     *
     * @returns {object}
     */
    getCurrencyData() {
        return this.currencyData;
    }

    /**
     * @param {object|number} item
     * @param {object} options
     *
     */
    _setCurrencyData(value, currency = null) {
        if (currency) {
            this.currencyData[currency] = Number(value);
        } else {
            this.currencyData = value;
        }
    }

    /**
    * Get a table result and parse it
    *
    * @notes Taken from Better Rolltables Module
    *
    * @param {*} result
    * @param {*} options
    *
    * @returns {Array} Array of results
    */
    async _parseResult(result, options = {}) {
        let betterResults = [];
        if (result.type === CONST.TABLE_RESULT_TYPES.TEXT) {
            betterResults = await this._parseTextResults(result, options);
        } else {
            let _uuid = "";
            if (result.type === CONST.TABLE_RESULT_TYPES.COMPENDIUM) {
                _uuid = `Compendium.${result.documentCollection}.${result.documentId}`;
            } else {
                _uuid = `${result.documentCollection}.${result.documentId}`;
            }
            let betterResult = {
                img: result.img,
                collection: result.collection,
                text: result.text,
                uuid: _uuid
            };
            

            betterResults.push(betterResult);
        }

        return betterResults;
    }

    async _parseTextResults(result, options = {}) {
        const textResults = result.text.split('|');
        let betterResults = [];

        for (let textResult of textResults) {
            // if the text is a currency, we process that first
            textResult = await this._processTextAsCurrency(textResult);
            textResult = await this._rollInlineDice(textResult);

            let parsedTextResult = this._getTextResult(textResult);

            // if a table definition is found, the textString is the rollFormula to be rolled on that table
            if (parsedTextResult.table) {
                const numberRolls = await this.tryRoll(textResult);
                const innerTableRoller = new TableRoller(table);
                const innerTableResults = await innerTableRoller.roll(numberRolls);

                // take care of nested tables
                this.tableResults = this.tableResults.concat(innerTableResults);
            } else if (parsedTextResult.textString) {
                if (parsedTextResult.collection) {
                    betterResult.collection = parsedTextResult.collection;
                }
                // if no table definition is found, the textString is the item name
                console.log(`results text ${textString.trim()} and commands ${parsedTextResult.commands}`);
                betterResult.img = result.img;
                betterResult.text = parsedTextResult.textString.trim();
                // if there is command, then it's not a pure text but a generated item
                if (parsedTextResult.commands.length === 0) {
                    betterResult.type = CONST.TABLE_RESULT_TYPES.TEXT;
                }
                betterResult.commands = commands;
                betterResults.push(betterResult);
            }
        }

        return betterResults;
    }


    async _getTextResult(textString) {
        // eslint-disable-next-line no-useless-escape
        const regex = /(\s*[^\[@]*)@*(\w+)*\[([\w.,*+-\/\(\)]+)\]/g;

        let result = { table: false, textString: false, commands: [], collection: false };
        let matches;

        while ((matches = regex.exec(textString)) !== null) {
            // matches[1] is undefined in case we are matching [tablename]
            // if we are matching @command[string] then matches[2] is the command and [3] is the arg inside []
            // console.log(`match 0: ${matches[0]}, 1: ${matches[1]}, 2: ${matches[2]}, 3: ${matches[3]}`);

            if (matches[1] !== undefined && matches[1].trim() !== '') {
                result.textString = matches[1];
            }

            const commandName = matches[2],
                innerTableName = matches[3];

            if (!commandName && innerTableName) {
                const out = Utils.separateIdCompendiumName(innerTableName);
                const tableName = out.nameOrId;
                const tableCompendiumName = out.compendiumName;

                if (tableCompendiumName) {
                    result.table = await Utils.findInCompendiumByName(tableCompendiumName, tableName);
                } else {
                    result.table = game.tables.getName(tableName);
                }

                if (!result.table) ui.notifications.warn(`${MODULE.ns} | no table with name ${tableName} found in compendium pack ${tableCompendiumName}`);
                break;
            } else if (commandName) {
                result.commands.push({ command: commandName.toLowerCase(), arg: matches[3] });
                if (commandName.toLowerCase() === 'compendium') {
                    result.collection = matches[3];
                }
            }
        }

        return result;
    }

    /**
     *
     *
     * @param {object} item
     * @param {Actor} actor
     * @param {object} options
     *
     * @returns {Item} the created Item
     *
     * @private
     */
    async _addLootItem(actor, item, options) {
        const newItem = await this.buildItemData(item),
            embeddedItems = [...actor.getEmbeddedCollection('Item').values()],
            originalItem = embeddedItems.find(i => i.name === newItem.name);

        if (!newItem) console.error(`${MODULE.ns} | _createLootItem: no newItem could be generated from object:`, item);
        let itemQuantity = newItem?.system?.quantity || 1,
            itemLimit = 0;

        if (options?.customRoll) {
            itemQuantity = (await (new Roll(options?.customRoll.itemQtyFormula, actor)).roll({ async: true })).total;
            itemLimit = (await (new Roll(options?.customRoll.itemQtyLimitFormula, actor)).roll({ async: true })).total;
        }

        let originalItemQuantity = originalItem?.system?.quantity || 1,
            limitCheckedQuantity = this._handleLimitedQuantity(itemQuantity, originalItemQuantity, itemLimit);

        /** if the item is already owned by the actor (same name and same PRICE) */
        if (originalItem) {
            /** add quantity to existing item */
            let updateItem = {
                _id: originalItem.id,
                system: {
                    quantity: limitCheckedQuantity
                }
            };

            if (limitCheckedQuantity != itemQuantity) {
                await actor.updateEmbeddedDocuments('Item', [updateItem]);
            }

            return;
        }
        if (newItem.name) {
            newItem.system.quantity = limitCheckedQuantity;
            /** we create a new item if we don't own it already */
            await actor.createEmbeddedDocuments('Item', [newItem]);
        }
    }

    /**
     *
     * @param {number} currentQty Quantity of item we want to add
     * @param {number} originalQty Quantity of the originalItem already in posession
     * @param {number} customLimit A custom Limit
     * @returns
     */
    _handleLimitedQuantity(currentQty, originalQty, customLimit = 0) {
        const newQty = Number(originalQty) + Number(currentQty);

        if (customLimit > 0) {
            // limit is bigger or equal to newQty
            if (Number(customLimit) >= Number(newQty)) {
                return newQty;
            }
            //limit was reached, we stick to that limit
            return customLimit;
        }

        //we don't care for the limit
        return newQty;
    }


    /**
      *
      * @param {String} tableText
      * @returns
      */
    async _processTextAsCurrency(tableText) {
        const regex = /{([^}]+)}/g
        let matches

        while ((matches = regex.exec(tableText)) != null) {
            this._addCurrency(await CurrencyHelper.generateCurrency(matches[1]));
        }

        return tableText.replace(regex, '');
    }

    /**
     *
     * @param {string} tableText
     * @returns
     */
    async _rollInlineDice(tableText) {
        const regex = /\[{2}(\w*[^\]])\]{2}/g
        let matches
        while ((matches = regex.exec(tableText)) != null) {
            tableText = tableText.replace(matches[0], await this.tryRoll(matches[1]))
        }

        return tableText
    }

    /**
       *
       * @param {object} itemData
       * @param {object[]} commands
       * @returns {object} itemData
       */
    _applyCommandToItemData(itemData, commands) {
        for (const cmd of commands) {
            // TODO check the type of command, that is a command to be rolled and a valid command
            let rolledValue;
            try {
                rolledValue = new Roll(cmd.arg).roll().total;
            } catch (error) {
                continue;
            }
            setProperty(itemData, `${cmd.command.toLowerCase()}`, rolledValue);
        }
        return itemData;
    }

    /**
       *
       * @param {string} rollFormula
       * @returns
       */
    async tryRoll(rollFormula) {
        try {
            return (await (new Roll(rollFormula)).roll({ async: true })).total || 1;
        } catch (error) {
            console.error(MODULE.ns + ' | currencyHelper :', error);
            return 1;
        }
    }

    /**
     *
     * @param {Actor} actor
     * @param {object} options
     *
     * @returns {Array<Item>} Array of added items
     *
     */
    async addItemsToActor(actor, options) {

        const uniqueItems = this.lootResults.reduce((acc, e) => {
            const found = acc.find(x => e.text === x.text && e.collection === x.collection);
            if (found) {
                let quantity = found.system?.quantity || 1;
                found.system = {quantity: quantity + 1}
            } else {
                acc.push(e);
            }
            return acc
        }, []);

        for (const item of uniqueItems) {
            await this._addLootItem(actor, item, options);
        }
    }

    /**
     *
     * @param {object} itemData
     * @param {Item} originalItem
     * @returns
     */
    async preItemCreationDataManipulation(itemData, originalItem = null) {
        itemData = this.createScrollFromSpell(itemData);

        if (originalItem && originalItem.documentName) {
            itemData = await ItemHelper.applyItemConversions(itemData, originalItem.documentName);
        }

        return itemData;
    }

    /**
     *
     * @param {number} level
     *
     * @returns {Item}
     */
    async _getRandomSpell(level) {
        await this.updateSpellCache();
        const spellList = this.getSpellCache();
        let spells = [];
        for (var i = 0; i < spellList.length; i++)
        {
            const spellDesc = spellList[i];
            const spellReal = await Utils.findInCompendiumById(spellDesc.collection, spellDesc._id);
            if(spellReal.system.level === level)
            {
                spells.push(spellReal);
            }
        }
        const spell = spells[Math.floor(Math.random() * spells.length)]
        return spell; 
    }

    /**
   * Update spell cache used for random spell scroll generation
   *
   * @returns {Promise<void>}
   */
    async updateSpellCache(pack) {
        if (game.user.isGM) {
            const defaultPack = 'dnd5e.spells';
            // const defaultPack = game.settings.get(MODULE.ns,'dnd5e.spells');
            const spellCompendium = game.packs.get(defaultPack);

            if (!pack && spellCompendium || pack === defaultPack) {
                const spellCompendiumIndex = await spellCompendium.getIndex({ fields: ['level', 'img'] })
                this._spellCache = spellCompendiumIndex.filter(entry => entry.type === "spell").map(i => mergeObject(i, { collection: spellCompendium.collection }))
            } else {
                ui.notifications.error(MODULE.ns + `| Spell cache could not be initialized/updated.`);
            }
        }
    }

    /**
       * Get spells in cache for
       * @returns {*}
       */
    getSpellCache() {
        return this._spellCache;
    }

    /**
     *
     * @param {object} itemData ~ {Item}.data
     * @throws {Warning}
     *
     * @returns {object} itemData ~ {Item}.data
     */
    async createScrollFromSpell(itemData) {

        const match = /\s*Spell\s*Scroll\s*(\d+|cantrip)/gi.exec(itemData.name);

        itemData = duplicate(itemData);

        if (!match) {
            return itemData
        }

        // If it is a scroll then open the compendium
        const level = match[1].toLowerCase() === 'cantrip' ? 0 : parseInt(match[1])
        const item = await this._getRandomSpell(level)

        if (!item) {
            ui.notifications.warn(MODULE.ns + ` | No spell of level ${level} found in compendium  ${item.collection} `)
            return itemData
        }

        const itemLink = `@Compendium[${item.pack}.${item._id}]`
        // make the name shorter by removing some text
        itemData.name = itemData.name.replace(/^(Spell\s)/, '')
        itemData.name = itemData.name.replace(/(Cantrip\sLevel)/, 'Cantrip')
        itemData.name += ` (${item.name})`
        itemData.description = '<blockquote>' + itemLink + '<br />' + item.system.description + '<hr />' 
        itemData.type = 'spell';
        itemData.level = item.system.level;

        return itemData;
    }
}
