const playwright = require('playwright');
const fs = require('fs');

(async () => {
    // use firefox here, b/c it has real user agents
    const browser = await playwright.firefox.launch({ headless: false });
    
    // get accounts from the accounts.json file
    let accounts = JSON.parse(fs.readFileSync("./accounts.json"));

    // make a browser window for each account
    accounts.map(async ([email, password]) => {
        console.log(`${email} Setting up...`);
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.setDefaultTimeout(900000); // if you have many accounts this needs to be big
        await page.goto("https://console.cloud.google.com/freetrial/signup/tos?cloudshell=true");

        // it'll first be prompted to login in google account
        console.log(`${email} Waiting for login prompt...`);
        await page.waitForSelector("input[type=email]");

        // fill the credentials
        console.log(`${email} Filling the credentials...`);
        await page.fill("input[type=email]", email);
        await page.keyboard.press('Enter');
        await page.fill("input[type=password]", password);
        await page.keyboard.press('Enter');

        // press any potential "Not Now" or "Confirm" Buttons
        console.log(`${email} wait for network idle`);
        try { await page.waitForLoadState('networkidle', { timeout: 10000 }) } catch { }
        const authPopup = page.url().includes("gds.google.com") || page.url().includes("myaccount.google.com");
        
        // transate page to english if auth popup appears
        if(authPopup) {
            console.log(`${email} redirecting to EN...`);
            let initialLang = page.url().match(/&hl=(.+)&continue/)[0];
            let newUrl = page.url().replace(initialLang, "&hl=en&continue");
            await page.goto(newUrl, { waitUntil: 'networkidle' });
            
            // click the nessesary buttons to continue
            console.log(`${email} skipping popups...`);
            const confirmButton = await page.$("text=Confirm");
            const notNowButton = await page.$("text=Not Now");
            if(confirmButton) confirmButton.click();
            if(notNowButton) notNowButton.click();
            await page.waitForLoadState('networkidle');
        }

        // accept terms and conditions
        console.log(`${email} Waiting for shell menu...`);
        const iframeSelector = ".cfc-panel-content-wrapper.cfc-panel-side-bottom>div>pcc-cloud-shell-wrapper>xap-deferred-loader-outlet>pcc-cloud-shell>#cloud-shell-wrapper>div#cloud-shell-container>iframe";
        await page.waitForSelector(iframeSelector);
        let iframe = await page.frameLocator(iframeSelector);

        try {
            console.log(`${email} Accepting terms and conditions...`);
            await iframe.locator("span.mat-checkbox-inner-container").click({ timeout: 1000 });
            await iframe.locator("text=Start Cloud Shell").click({ timeout: 1000 });
        } catch {}
        
        // wait for the terminal to fully load
        console.log(`${email} Waiting for terminal to load...`);
        try { await page.waitForLoadState('networkidle', { timeout: 60000 }) } catch { }
        
        // focus the terminal
        console.log(`${email} focus terminal...`);
        await iframe.locator(".active-terminal-frame").click();
        
        // enter zero day terminal code
        console.log(`${email} enter payload...`);
        await page.keyboard.type('docker run -p 6080:80 dorowu/ubuntu-desktop-lxde-vnc');
        await page.keyboard.press('Enter');

        // open the webview
        console.log(`${email} opening webview and changing port...`);
        await iframe.locator(`[spotlight-id="devshell-web-preview-button"]`).click();
        await iframe.locator(`text=Change port`).click();
        await iframe.locator(`[formcontrolname="port"]`).fill("6080");
        const [ vncPage ] = await Promise.all([
            context.waitForEvent('page'),
            await iframe.locator(`text=Change and Preview`).click() // Opens a new tab
        ]);

        // refresh tab until vnc loads
        const refresh = async () => {
            try { await vncPage.waitForSelector("text=Couldn't connect to a server on port 6080", { timeout: 5000 }) } catch { }
            if(await vncPage.$("text=Couldn't connect to a server on port 6080")) {
                console.log(`${email} refreshing...`);
                await vncPage.reload();
                setTimeout(refresh, 20000);
            }
        }

        console.log(`${email} refreshing every 20s until vnc loads...`);
        await refresh();

        console.log(`${email} vnc ready to be used!`);
        vncPage.bringToFront();
    })
})()