const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const path = require('path');

require('dotenv').config();

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
    }); // set headless: true if you don't want to see the browser

    let page = await browser.newPage();

    // Go to login page
    await page.goto(
        'https://www.hiloenergie.com/Util/Login?ReturnUrl=https://www.hiloenergie.com/EPiServer/Commerce/OrderManagement#/?type=Order&createdOn=Apr%2025%2C%202025-Apr%2026%2C%202025',
        { waitUntil: 'networkidle2' }
    );

    // Optional: wait for the form elements to be available
    await page.waitForSelector('#UserName');
    await page.waitForSelector('#Password');
    await page.waitForSelector('input[name="__RequestVerificationToken"]');

    // Get the CSRF Token value
    const csrfToken = await page.$eval(
        'input[name="__RequestVerificationToken"]',
        (el) => el.value
    );

    // Fill username and password
    await page.type('#UserName', 'justin.kim@verndale.com');
    await page.type('#Password', process.env.PASSWORD);

    await page.click('#Submit');

    await delay(3000); // wait for the page to load properly
    // close tab
    await page.close();

    const numberOfPages = await getMaxPageCount(
        'https://www.hiloenergie.com/EPiServer/Commerce/OrderManagement#/?type=Order&status=PendingTransferToCrm',
        browser,
        page
    );
    console.log(`Number of Pending Transfer to CRM: ${numberOfPages}`);

    const numberOfPages2 = await getMaxPageCount(
        'https://www.hiloenergie.com/EPiServer/Commerce/OrderManagement#/?type=Order&status=SentToCrm&createdOn=Apr%2025%2C%202025-Apr%2026%2C%202025',
        browser,
        page
    );
    console.log(`Number of Sent to CRM: ${numberOfPages2}`);

    browser.close();

    await addDataToSheet(
        '15cA4K-LJRKpndili_cRqRJEtonsco4OVOghx87np6Qw',
        numberOfPages,
        numberOfPages2
    );
})();

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time);
    });
}

async function getMaxPageCount(url, browser, page) {
    page = await browser.newPage();

    await page.goto(url);

    // wait for page to load
    await page.waitForSelector(
        'li.push--sides button[aria-label="Next Page"]',
        { visible: true }
    );

    // Scroll to bottom to make sure pagination loads
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });

    // 3. Find the highest page number and click it
    const highestPage = await page.evaluate(() => {
        const buttons = Array.from(
            document.querySelectorAll('nav.oui-pagination-controls button')
        );

        let maxNum = 1;
        let maxButton = null;

        for (const btn of buttons) {
            const text = btn.innerText.trim();
            const num = parseInt(text, 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
                maxButton = btn;
            }
        }

        if (maxButton) {
            maxButton.click();
        }

        return maxNum;
    });

    // wait for the new page to load (aka there is new data)
    const initialOrderNumber = await page.evaluate(() => {
        const cell = document.querySelector(
            'td.epi-uif-data-table-cell.mdc-data-table__cell.rmwc-data-table__cell span.orderNumberLink'
        );
        return cell ? cell.innerText.trim() : null;
    });

    // console.log(`Initial Order Number: ${initialOrderNumber}`);

    // Now wait until it changes
    await page.waitForFunction(
        (initial) => {
            const cell = document.querySelector(
                'td.epi-uif-data-table-cell.mdc-data-table__cell.rmwc-data-table__cell span.orderNumberLink'
            );
            if (!cell) return false;
            return cell.innerText.trim() !== initial;
        },
        { timeout: 60000 },
        initialOrderNumber
    );

    // select all checkboxes on the page
    await page.evaluate(() => {
        const checkboxDiv = document.querySelector(
            'div.mdc-ripple-upgraded--unbounded.mdc-ripple-upgraded.epi-uif-checkbox.mdc-data-table__header-row-checkbox.mdc-checkbox--upgraded.mdc-checkbox'
        );
        if (checkboxDiv) {
            const checkboxInput = checkboxDiv.querySelector(
                'input[type="checkbox"]'
            );
            if (checkboxInput) {
                checkboxInput.click();
            }
        }
    });

    // 6. Wait for "Selected" number to appear
    await page.waitForSelector('span.axiom-typography--body', {
        visible: true,
    });

    // 7. Read the "Selected" number
    const selectedNumber = await page.evaluate(() => {
        const span = document.querySelector('span.axiom-typography--body');
        if (span) {
            const match = span.innerText.match(/\d+/); // extract first number
            return match ? parseInt(match[0], 10) : 0;
        }
        return 0;
    });

    page.close();
    return (highestPage - 1) * 50 + selectedNumber; // 50 is the number of items per page
}

async function addDataToSheet(SPREADSHEET_ID, number1, number2) {
    // CONFIGURATION
    const SHEET_NAME = 'Sheet1'; // Adjust if your tab name is different
    const SERVICE_ACCOUNT_FILE = path.join(
        './keys/',
        'hilo-puppeteer-31270d897ca4.json'
    ); // <-- your service account JSON file

    // Your values
    const now = getCurrentDateTime();
    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_FILE,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Get current rows to find first empty row
    const readRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C:C`, // Check column C
    });

    const existingRows = readRes.data.values || [];
    const firstEmptyRow = existingRows.length + 1;

    console.log(`First empty row is: ${firstEmptyRow}`);

    // Insert values into C, D, and E
    const myDateTime = [[now]]; // Adjust the values as needed

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!C${firstEmptyRow}:C${firstEmptyRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: myDateTime,
        },
    });

    // Insert values into C, D, and E
    const values = [[number1, number2, number1 + number2]]; // Adjust the values as needed

    await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!D${firstEmptyRow}:F${firstEmptyRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values: values,
        },
    });

    console.log('Data inserted successfully!');
}

// Create current date-time without timezone
function getCurrentDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months start from 0
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
