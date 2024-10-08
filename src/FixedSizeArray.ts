export class FixedSizeArray {
    private items: [string, string, number, boolean][] = [];  // 存储 [sender, content, serverNumber, isComm] 元组的数组
    private maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    add(sender: string, content: string, serverNumber: number, isComm?: boolean): void {
        if (this.items.length >= this.maxSize) {
            this.items.shift();  // 超过最大容量时移除第一个元素
        }
        this.items.push([sender, content, serverNumber, isComm ? isComm : false]);
        console.log(this.items);
    }
    
    getItems(serverNumber: number): [string, string, number, boolean][] {
        console.log("get getItems");
        
        if (serverNumber === -1 ) {
            return this.items;
        }
        return this.items.filter(item => item[2] === serverNumber);
    }

    clear(serverNumber: number): void {
        if (serverNumber === -1) {
            this.items = [];
        } else {
            this.items = this.items.filter(item => item[2] !== serverNumber);
        }
    }
}
