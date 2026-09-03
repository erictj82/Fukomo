/**
 * ESC/POS Command Builder for Thermal Printing
 * Builds raw ESC/POS binary data for 58mm/80mm thermal printers
 */

export const ESC = '\x1B';
export const GS = '\x1D';
export const LF = '\x0A';

export const Commands = {
    INIT: `${ESC}@`,              // Initialize printer
    CENTER: `${ESC}a\x01`,       // Center align
    LEFT: `${ESC}a\x00`,         // Left align
    RIGHT: `${ESC}a\x02`,        // Right align
    BOLD_ON: `${ESC}E\x01`,      // Bold on
    BOLD_OFF: `${ESC}E\x00`,     // Bold off
    DOUBLE_HEIGHT: `${ESC}!\x10`, // Double height
    DOUBLE_WIDTH: `${ESC}!\x20`,  // Double width
    DOUBLE_BOTH: `${ESC}!\x30`,   // Double height + width
    NORMAL_SIZE: `${ESC}!\x00`,   // Normal size
    UNDERLINE_ON: `${ESC}-\x01`,  // Underline on
    UNDERLINE_OFF: `${ESC}-\x00`, // Underline off
    SEPARATOR_58: '--------------------------------\n',   // 32 chars for 58mm (max)
    SEPARATOR_80: '----------------------------------------------\n', // 46 chars for 80mm
    FEED_1: `${ESC}d\x01`,       // Feed 1 line
    FEED_2: `${ESC}d\x02`,       // Feed 2 lines
    FEED_3: `${ESC}d\x03`,       // Feed 3 lines
    FEED_5: `${ESC}d\x05`,       // Feed 5 lines
    PARTIAL_CUT: `${GS}V\x01`,   // Partial cut
    FULL_CUT: `${GS}V\x00`,      // Full cut
};

function formatCurrencyShort(amount: number): string {
    return `Rp${(amount || 0).toLocaleString('id-ID')}`;
}

function padRight(text: string, width: number): string {
    return text.length >= width ? text.substring(0, width) : text + ' '.repeat(width - text.length);
}

function padLeft(text: string, width: number): string {
    return text.length >= width ? text.substring(0, width) : ' '.repeat(width - text.length) + text;
}

function formatDate(date: Date): string {
    const d = new Date(date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

export interface ThermalReceiptData {
    storeName: string;
    address?: string;
    phone?: string;
    invoiceNumber: string;
    date: Date;
    staffName: string;
    customerName?: string;
    items: {
        name: string;
        quantity: number;
        price: number;
        discount: number;
        total: number;
        discountNote?: string;
        description?: string;
    }[];
    subtotal: number;
    discount: number;
    tax: number;
    totalAmount: number;
    amountPaid: number;
    paymentMethod: string;
    paymentMethods?: { method: string; amount: number }[];
    deposits?: { date: Date; paymentMethod: string; amount: number }[];
    staffAssignments?: { name: string; tip?: number }[];
    tips?: number;
    loyaltyPointsUsed?: number;
    loyaltyPointsEarned?: number;
    receiptFooter?: string;
    paperWidth?: 58 | 80; // mm
    isAppointment?: boolean;
    qrUrl?: string;
    showStaffOnReceipt?: boolean;
    showTaxOnReceipt?: boolean;
}

export function buildReceiptBuffer(data: ThermalReceiptData): string {
    const width = data.paperWidth === 80 ? 46 : 32; // character width
    const separator = data.paperWidth === 80 ? Commands.SEPARATOR_80 : Commands.SEPARATOR_58;
    const thickSeparator = data.paperWidth === 80 ? '==============================================\n' : '================================\n';
    const cutLine = data.paperWidth === 80 ? '- - - - - - - - - - - - - - - - - - - - - - - \n' : '- - - - - - - - - - - - - - - -\n';
    
    let buffer = '';

    // Initialize
    buffer += Commands.INIT;

    // Store Header
    buffer += Commands.CENTER;
    buffer += Commands.BOLD_ON;
    buffer += `${data.storeName.toUpperCase()}\n`;
    buffer += Commands.BOLD_OFF;
    if (data.address) buffer += `${data.address.toUpperCase()}\n`;
    if (data.phone) buffer += `TEL: ${data.phone}\n`;
    buffer += `\n`;
    buffer += separator;

    // Receipt Header
    buffer += Commands.BOLD_ON;
    buffer += `INVOICE\n`;
    buffer += Commands.BOLD_OFF;
    buffer += separator;

    // Invoice Info (Right aligned values)
    const labelWidth = width - 21; // Allocate more space to values
    buffer += Commands.LEFT;
    buffer += `${padRight('Receipt No:', labelWidth)}${padLeft(data.invoiceNumber, 21)}\n`;
    buffer += `${padRight('Date:', labelWidth)}${padLeft(formatDate(data.date), 21)}\n`;
    
    if (data.customerName) {
        buffer += padRight('Customer:', labelWidth);
        buffer += Commands.BOLD_ON;
        buffer += padLeft(data.customerName.toUpperCase(), 21);
        buffer += Commands.BOLD_OFF;
        buffer += '\n';
    }
    buffer += `\n`;

    // Items Header
    if (data.paperWidth === 80) {
        buffer += `ITEM DESCRIPTION QTY      UNIT\n`;
        buffer += `                         PRICE   SUBTOTAL\n`;
    } else {
        buffer += `ITEM        QTY    PRICE   TOTAL\n`;
    }
    buffer += thickSeparator;

    // Items
    for (const item of data.items) {
        const qtyStr = String(item.quantity);
        const priceStr = 'Rp' + (item.price || 0).toLocaleString('id-ID');
        const totalStr = 'Rp' + (item.total || 0).toLocaleString('id-ID');
        
        let itemName = item.name;
        
        if (data.paperWidth === 80) {
            // Layout for 80mm
            itemName = padRight(itemName, 17);
            const qtyPadded = padLeft(qtyStr, 3);
            const pricePadded = padLeft(priceStr, 12);
            const totalPadded = padLeft(totalStr, 12);
            
            buffer += Commands.BOLD_ON;
            buffer += itemName;
            buffer += Commands.BOLD_OFF;
            buffer += ` ${qtyPadded} ${pricePadded} ${totalPadded}\n`;
            
            // Just add a nice label below for items since we can't do pill backgrounds
            buffer += `  SERVICE\n`;
        } else {
            // Layout for 58mm
            itemName = padRight(itemName, 11);
            const qtyPadded = padLeft(qtyStr, 3);
            const pricePadded = padLeft(priceStr, 8);
            const totalPadded = padLeft(totalStr, 8);
            buffer += Commands.BOLD_ON;
            buffer += itemName;
            buffer += Commands.BOLD_OFF;
            buffer += ` ${qtyPadded} ${pricePadded} ${totalPadded}\n`;
        }

        const desc = String(item.description || '').trim();
        if (desc) {
            buffer += `  ${desc}\n`;
        }

        if (item.discountNote) {
            buffer += `  ${item.discountNote}\n`;
        } else if (item.discount > 0) {
            buffer += `  Diskon: -${formatCurrencyShort(item.discount)}\n`;
        }
        buffer += `\n`;
    }

    buffer += thickSeparator;

    // Totals
    const totalLabelWidth = width - 15;
    
    buffer += `${padRight('Gross Subtotal', totalLabelWidth)}${padLeft('Rp' + (data.subtotal).toLocaleString('id-ID'), 15)}\n\n`;

    if (data.discount > 0) {
        buffer += `${padRight('Discount', totalLabelWidth)}${padLeft('-Rp' + (data.discount).toLocaleString('id-ID'), 15)}\n`;
    }

    if (data.showTaxOnReceipt !== false) {
        buffer += separator;

        buffer += `${padRight('TAXABLE AMOUNT', totalLabelWidth)}${padLeft('Rp' + (data.subtotal - data.discount).toLocaleString('id-ID'), 15)}\n`;
        
        buffer += `${padRight('GST / Tax', totalLabelWidth)}${padLeft('Rp' + (data.tax).toLocaleString('id-ID'), 15)}\n`;
    }

    buffer += thickSeparator;

    buffer += Commands.BOLD_ON;
    buffer += `${padRight('GRAND TOTAL', totalLabelWidth)}${padLeft('RP' + (data.totalAmount).toLocaleString('id-ID'), 15)}\n`;
    buffer += Commands.BOLD_OFF;

    buffer += `${padRight('Net Paid', totalLabelWidth)}${padLeft('Rp' + (data.amountPaid).toLocaleString('id-ID'), 15)}\n\n`;

    // Served By (staff assignments)
    if (data.showStaffOnReceipt !== false && data.staffAssignments && data.staffAssignments.length > 0) {
        buffer += separator;
        buffer += `SERVED BY\n`;
        for (const sa of data.staffAssignments) {
            let line = `  * ${sa.name}`;
            if (sa.tip && sa.tip > 0) {
                const tipStr = 'Tip: Rp' + sa.tip.toLocaleString('id-ID');
                line = padRight(line, totalLabelWidth);
                line += padLeft(tipStr, 15);
            }
            buffer += `${line}\n`;
        }
        buffer += `\n`;
    }

    // Payment History
    if (data.deposits && data.deposits.length > 0) {
        buffer += `PAYMENT HISTORY\n`;
        for (const dep of data.deposits) {
            const depDate = formatDate(dep.date);
            buffer += `${depDate} * ${dep.paymentMethod.toUpperCase()}`;
            buffer += Commands.BOLD_ON;
            buffer += padLeft('Rp' + dep.amount.toLocaleString('id-ID'), width - (depDate.length + 3 + dep.paymentMethod.length));
            buffer += Commands.BOLD_OFF;
            buffer += '\n';
        }
    } else {
        buffer += `PAYMENT HISTORY\n`;
        const depDate = formatDate(data.date);
        const historyLine = `${depDate} * ${data.paymentMethod.toUpperCase()}`;
        buffer += historyLine;
        buffer += Commands.BOLD_ON;
        buffer += padLeft('Rp' + data.amountPaid.toLocaleString('id-ID'), width - historyLine.length);
        buffer += Commands.BOLD_OFF;
        buffer += '\n';
    }
    
    buffer += `\n`;

    // Payment Method Centered
    buffer += Commands.CENTER;
    buffer += `PAYMENT METHOD\n`;
    buffer += Commands.BOLD_ON;
    buffer += `[ ${data.paymentMethod.toUpperCase()} ]\n`;
    buffer += Commands.BOLD_OFF;
    
    buffer += `\n`;
    buffer += cutLine;
    buffer += `\n`;

    // Footer messages
    buffer += Commands.CENTER;
    buffer += Commands.BOLD_ON;
    buffer += `THANK YOU FOR CHOOSING ${data.storeName}!\n`;
    buffer += `PLEASE VISIT AGAIN.\n\n`;
    buffer += Commands.BOLD_OFF;
    
    if (data.receiptFooter) {
        buffer += `${data.receiptFooter}\n\n`;
    }
    
    // QR Code
    if (data.qrUrl) {
        buffer += Commands.BOLD_ON;
        buffer += `SCAN FOR DIGITAL RECEIPT\n`;
        buffer += Commands.BOLD_OFF;
        
        // QR Code ESC/POS commands
        const qrData = data.qrUrl;
        const storeLen = qrData.length + 3;
        const pL = storeLen & 0xFF;
        const pH = (storeLen >> 8) & 0xFF;

        buffer += `${GS}(k\x04\x00\x31\x41\x32\x00`;
        buffer += `${GS}(k\x03\x00\x31\x43\x05`; // Increased QR size from 4 to 5
        buffer += `${GS}(k\x03\x00\x31\x45\x30`;
        buffer += `${GS}(k${String.fromCharCode(pL)}${String.fromCharCode(pH)}\x31\x50\x30${qrData}`;
        buffer += `${GS}(k\x03\x00\x31\x51\x30`;
        
        buffer += `\n`;
        
        // Invoice Number Spaced Out
        const spacedInvoice = data.invoiceNumber.split('').join(' ');
        buffer += `${spacedInvoice}\n`;
    }

    // Feed and cut
    buffer += Commands.FEED_5;
    buffer += Commands.PARTIAL_CUT;

    return buffer;
}
