const puppeteer = require('puppeteer');
require('dotenv').config();

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        executablePath:
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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
    page = await browser.newPage();

    await page.goto(
        'https://www.hiloenergie.com/EPiServer/Commerce/OrderManagement#/?type=Order&status=PendingTransferToCrm'
    );

    // wait for page to load
    await page.waitForSelector(
        'li.push--sides button[aria-label="Next Page"]',
        { visible: true }
    );

    // Scroll to bottom to make sure pagination loads
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });

    // Find pagination numbers
    const numberOfPages = await page.evaluate(() => {
        // Find all buttons inside the pagination controls
        const buttons = document.querySelectorAll(
            'nav.oui-pagination-controls button'
        );

        const pageNumbers = Array.from(buttons)
            .map((btn) => {
                const text = btn.innerText.trim();
                // Only keep buttons where text is a number
                const num = parseInt(text, 10);
                return isNaN(num) ? null : num;
            })
            .filter((num) => num !== null);

        // Return the maximum page number found
        return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
    });

    console.log(`Number of pages: ${numberOfPages}`);

    await page.close();
    page = await browser.newPage();
    await page.goto(
        'https://www.hiloenergie.com/EPiServer/Commerce/OrderManagement#/?type=Order&status=SentToCrm&createdOn=Apr%2025%2C%202025-Apr%2026%2C%202025'
    );
})();

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time);
    });
}
