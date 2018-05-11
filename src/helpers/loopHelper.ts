import {Empire} from "../ai/Empire";
import {AutoOperation} from "../ai/operations/AutoOperation";
import {ConquestOperation} from "../ai/operations/ConquestOperation";
import {DemolishOperation} from "../ai/operations/DemolishOperation";
import {FlexOperation} from "../ai/operations/FlexOperation";
import {FortOperation} from "../ai/operations/FortOperation";
import {KeeperOperation} from "../ai/operations/KeeperOperation";
import {MiningOperation} from "../ai/operations/MiningOperation";
import {Operation} from "../ai/operations/Operation";
import {QuadOperation} from "../ai/operations/QuadOperation";
import {RaidOperation} from "../ai/operations/RaidOperation";
import {TransportOperation} from "../ai/operations/TransportOperation";
import {ZombieOperation} from "../ai/operations/ZombieOperation";
import {MINERALS_RAW, PRODUCT_LIST, RESERVE_AMOUNT} from "../ai/TradeNetwork";
import {CACHE_INVALIDATION_FREQUENCY, CACHE_INVALIDATION_PERIOD} from "../config/constants";
import {notifier} from "../notifier";
import {consoleCommands} from "./consoleCommands";
import {helper} from "./helper";

const OPERATION_CLASSES = {
    conquest: ConquestOperation,
    fort: FortOperation,
    mining: MiningOperation,
    tran: TransportOperation,
    keeper: KeeperOperation,
    demolish: DemolishOperation,
    raid: RaidOperation,
    quad: QuadOperation,
    auto: AutoOperation,
    flex: FlexOperation,
    zombie: ZombieOperation,
};

export let empire: Empire;

export let loopHelper = {

    initEmpire() {
        empire = new Empire();
        global.emp = empire;
        empire.init();
    },

    getOperations(_empire: Empire): Operation[] {

        // gather flag data, instantiate operations
        const operationList: { [operationName: string]: Operation } = {};
        for (const flagName in Game.flags) {
            for (const typeName in OPERATION_CLASSES) {
                if (!OPERATION_CLASSES.hasOwnProperty(typeName)) continue;
                if (flagName.substring(0, typeName.length) === typeName) {
                    const operationClass = OPERATION_CLASSES[typeName];
                    const flag = Game.flags[flagName];
                    const name = flagName.substring(flagName.indexOf("_") + 1);

                    if (operationList.hasOwnProperty(name)) {
                        console.log(`operation with name ${name} already exists (type: ${operationList[name].type}),` +
                            `please use a different name`);
                        continue;
                    }

                    let operation;
                    try {
                        operation = new operationClass(flag, name, typeName, _empire);
                    } catch (e) {
                        console.log("error parsing flag name and bootstrapping operation");
                        console.log(e);
                    }

                    operationList[name] = operation;
                    global[name] = operation;
                }
            }
        }

        Game.operations = operationList;

        return _.sortBy(operationList, (operation: Operation) => operation.priority);
    },

    initMemory: () => {
        _.defaultsDeep(Memory, {
            stats: {},
            temp: {},
            playerConfig: {
                terminalNetworkRange: 6,
                muteSpawn: false,
                enableStats: false,
                creditReserveAmount: Number.MAX_VALUE,
                powerMinimum: 9000,
            },
            profiler: {},
            traders: {},
            powerObservers: {},
            notifier: [],
            cpu: {
                history: [],
                average: Game.cpu.getUsed(),
            },
            hostileMemory: {},
        });
    },

    scavangeResources() {
        for (const v in Game.rooms) {
            const room = Game.rooms[v];
            const resources = room.find(FIND_DROPPED_RESOURCES) as Resource[];
            for (const resource of resources) {
                if (resource.amount > 10) {
                    const creep = resource.pos.lookFor(LOOK_CREEPS)[0] as Creep;
                    if (creep &&
                        creep.my &&
                        creep.memory.scavanger ===
                        resource.resourceType
                        &&
                        (!creep.carry[resource.resourceType] ||
                            creep.carry[resource.resourceType] <
                            creep.carryCapacity)) {
                        // const outcome = creep.pickup(resource);
                        creep.pickup(resource);
                    }
                }
            }
        }
    },

    invalidateCache: Game.time % CACHE_INVALIDATION_FREQUENCY < CACHE_INVALIDATION_PERIOD,

    grafanaStats(_empire: Empire) {

        if (!Memory.playerConfig.enableStats) return;

        if (!Memory.stats) Memory.stats = {};

        // STATS START HERE
        _.forEach(Game.rooms, room => {
            if (room.controller && room.controller.my) {
                Memory.stats["rooms." + room.name + ".energyAvailable"] = room.energyAvailable;
            }
        });

        for (const resourceType of MINERALS_RAW) {
            Memory.stats["empire.rawMinerals." + resourceType] = _empire.network.inventory[resourceType];
            Memory.stats["empire.mineralCount." + resourceType] = Game.cache[resourceType] || 0;
        }

        for (const resourceType of PRODUCT_LIST) {
            Memory.stats["empire.compounds." + resourceType] = _empire.network.inventory[resourceType];
            Memory.stats["empire.processCount." + resourceType] = Game.cache.labProcesses[resourceType] || 0;
        }

        Memory.stats["empire.activeLabCount"] = Game.cache.activeLabCount;

        Memory.stats["empire.energy"] = _empire.network.inventory[RESOURCE_ENERGY];

        for (const storage of _empire.network.storages) {
            Memory.stats["empire.power." + storage.room.name] = storage.store.power ? storage.store.power : 0;
        }

        // Profiler check
        for (const identifier in Memory.profiler) {
            const profile = Memory.profiler[identifier];
            Memory.stats["game.prof." + identifier + ".cpt"] = profile.costPerTick;
            Memory.stats["game.prof." + identifier + ".cpc"] = profile.costPerCall;
        }

        Memory.stats["game.time"] = Game.time;
        Memory.stats["game.gcl.level"] = Game.gcl.level;
        Memory.stats["game.gcl.progress"] = Game.gcl.progress;
        Memory.stats["game.gcl.progressTotal"] = Game.gcl.progressTotal;
        Memory.stats["game.cpu.limit"] = Game.cpu.limit;
        Memory.stats["game.cpu.tickLimit"] = Game.cpu.tickLimit;
        Memory.stats["game.cpu.bucket"] = Game.cpu.bucket;
        Memory.stats["game.cpu.used"] = Game.cpu.getUsed();
        Memory.stats["game.cpu.perCreep"] = Game.cpu.getUsed() / Object.keys(Game.creeps).length;
    },

    sendResourceOrder(_empire: Empire) {
        if (!Memory.resourceOrder) {
            Memory.resourceOrder = {};
        }
        for (const timeStamp in Memory.resourceOrder) {
            const order = Memory.resourceOrder[timeStamp];
            if (!order || order.roomName === undefined || order.amount === undefined) {
                console.log("problem with order:", JSON.stringify(order));
                return;
            }
            if (!order.amountSent) {
                order.amountSent = 0;
            }

            const sortedTerminals = _.sortBy(_empire.network.terminals, (t: StructureTerminal) =>
                Game.map.getRoomLinearDistance(order.roomName, t.room.name)) as StructureTerminal[];

            let count = 0;
            for (const terminal of sortedTerminals) {
                if (terminal.room.name === order.roomName) continue;
                if (terminal.store[order.resourceType] >= RESERVE_AMOUNT) {
                    const amount = Math.min(1000, order.amount - order.amountSent);
                    if (amount <= 0) {
                        break;
                    }
                    const msg = order.resourceType + " delivery: " + (order.amountSent + amount) + "/" + order.amount;
                    const outcome = terminal.send(order.resourceType, amount, order.roomName, msg);
                    if (outcome === OK) {
                        order.amountSent += amount;
                        console.log(msg);
                    }

                    count++;
                    if (count === order.efficiency) break;
                }
            }

            if (order.amountSent === order.amount) {
                console.log("finished sending mineral order: " + order.resourceType);
                Memory.resourceOrder[timeStamp] = undefined;
            }
        }
    },

    initConsoleCommands() {
        // command functions found in consoleCommands.ts can be executed from the game console
        // example: cc.minv()
        global.cc = consoleCommands;
        global.note = notifier;
        global.helper = helper;
    },

    garbageCollection() {

        if (Game.time < Memory.nextGC) { return; }

        for (const id in Memory.hostileMemory) {
            const creep = Game.getObjectById<Creep>(id);
            if (!creep) { delete Memory.hostileMemory[id]; }
        }

        Memory.nextGC = Game.time += helper.randomInterval(100);
    },
};
