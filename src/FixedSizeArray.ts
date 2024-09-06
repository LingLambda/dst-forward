export class FixedSizeArray {
    private items: [string, string, boolean][] = [];  // 存储 [sender, content , isComm] 元组的数组
    private maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    add(sender: string, content: string, isComm?: boolean): void {
        if (this.items.length >= this.maxSize) {
            this.items.shift();  // 超过最大容量时移除第一个元素
        }
        this.items.push([sender, content, isComm ? isComm : false]);  
    }

    getItems(): [string, string, boolean][] {
        return this.items;
    }

    clear(): void {
        this.items = [];
    }
}
