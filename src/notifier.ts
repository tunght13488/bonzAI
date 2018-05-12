export const notifier = {
    log(message: string, severity = 5) {
        const styles = {
            [0]: () => console.log(message),
            [1]: () => console.log(`<font color="#00FF00" severity="1">${message}</font>`),
            [2]: () => console.log(`<font color="#00FFFF" severity="2">${message}</font>`),
            [3]: () => console.log(`<font color="#FFFF00" severity="3">${message}</font>`),
            [4]: () => console.log(`<font color="#FF00FF" severity="4">${message}</font>`),
            [5]: () => console.log(`<font color="#FF0000" severity="4">${message}</font>`),
        };
        if (styles[severity]) {
            styles[severity]();
        }
        // if (severity === 5) {
        //     Memory.notifier.push({time: Game.time, earthTime: this.earthTime(-7), message});
        // }
        while (Memory.notifier.length > 1000) {
            Memory.notifier.shift();
        }
    },

    review(limit = Number.MAX_VALUE, burnAfterReading = false) {
        const messageCount = Memory.notifier.length;

        let count = 0;
        for (const value of Memory.notifier) {
            const secondsElapsed = (Game.time - value.time) * 3;
            const seconds = secondsElapsed % 60;
            const minutes = Math.floor(secondsElapsed / 60);
            const hours = Math.floor(secondsElapsed / 3600);
            console.log(`\n${value.time} (roughly ${
                hours > 0 ? `${hours} hours, ` : ""}${
                minutes > 0 ? `${minutes} minutes, ` : ""}${
                seconds > 0 ? `${seconds} seconds ` : ""}ago)`);
            console.log(`${value.message}`);
            count++;
            if (count >= limit) { break; }
        }

        let destroyed = 0;
        if (burnAfterReading) {
            while (Memory.notifier.length > 0) {
                Memory.notifier.shift();
                destroyed++;
                if (destroyed >= limit) { break; }
            }
        }

        return `viewing ${count} of ${messageCount} notifications`;
    },

    clear(term: string) {
        if (term) {
            let count = 0;
            term = term.toLocaleLowerCase();
            const newArray = [];
            for (const value of Memory.notifier) {
                if (value.message.toLocaleLowerCase().indexOf(term) < 0) {
                    newArray.push(value);
                    count++;
                }
                Memory.notifier = newArray;
            }

            return `removed ${count} messages;`;
        }
        else {
            const count = Memory.notifier.length;
            Memory.notifier = [];
            return `removed ${count} messages;`;
        }
    },
};
