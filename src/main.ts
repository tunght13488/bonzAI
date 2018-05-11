import {empire, loopHelper} from "./helpers/loopHelper";
import {Profiler} from "./Profiler";
import {initPrototypes} from "./prototypes/initPrototypes";
import {sandBox} from "./sandbox";
import {TimeoutTracker} from "./TimeoutTracker";

loopHelper.initMemory();
initPrototypes();

module.exports.loop = () => {
    Game.cache = {
        structures: {},
        hostiles: {},
        hostilesAndLairs: {},
        mineralCount: {},
        labProcesses: {},
        activeLabCount: 0,
        placedRoad: false,
        fleeObjects: {},
        lairThreats: {},
    };

    // TimeoutTracker - Diagnoses CPU timeouts
    try { TimeoutTracker.init(); } catch (e) { console.log("error initializing TimeoutTracker:\n", e.stack); }

    // Init phase - Information is gathered about the game state and game objects instantiated
    Profiler.start("init");
    loopHelper.initEmpire();
    const operations = loopHelper.getOperations(empire);
    for (const operation of operations) operation.init();
    Profiler.end("init");

    // RoleCall phase - Find creeps belonging to missions and spawn any additional needed.
    Profiler.start("roleCall");
    for (const operation of operations) operation.roleCall();
    Profiler.end("roleCall");

    // Actions phase - Actions that change the game state are executed in this phase.
    Profiler.start("actions");
    for (const operation of operations) operation.actions();
    Profiler.end("actions");

    // Finalize phase - Code that needs to run post-actions phase
    for (const operation of operations) operation.invalidateCache();
    Profiler.start("finalize");
    for (const operation of operations) operation.finalize();
    Profiler.end("finalize");

    // post-operation actions and utilities
    Profiler.start("postOperations");
    try { empire.actions(); } catch (e) { console.log("error with empire actions\n", e.stack); }
    try { loopHelper.scavangeResources(); } catch (e) { console.log("error scavenging:\n", e.stack); }
    try { loopHelper.sendResourceOrder(empire); } catch (e) { console.log("error reporting transactions:\n", e.stack); }
    try { loopHelper.initConsoleCommands(); } catch (e) { console.log("error loading console commands:\n", e.stack); }
    try { sandBox.run(); } catch (e) { console.log("error loading sandbox:\n", e.stack); }
    try { loopHelper.garbageCollection(); } catch (e) { console.log("error during garbage collection:\n", e.stack); }
    Profiler.end("postOperations");
    try { Profiler.finalize(); } catch (e) { console.log("error checking Profiler:\n", e.stack); }
    try { TimeoutTracker.finalize(); } catch (e) { console.log("error finalizing TimeoutTracker:\n", e.stack); }
    try { loopHelper.grafanaStats(empire); } catch (e) { console.log("error reporting stats:\n", e.stack); }
};
