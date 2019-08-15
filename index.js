const fs = require('fs');
const path = require('path');
const {google} = require('googleapis');
const _ = require('lodash');
const GmailAuth = require('./gmail-auth');
const DStore = require('./dstore');
const puppeteer = require('puppeteer');
const os = require('os');
const async = require('async');
const MergePdf = require('pdf-merge');
const cache = new DStore('cache.db');


const cpus = os.cpus().length;
GmailAuth('credentials.json', processEmails);




async function processEmails(auth) {
    const Gmail = google.gmail({version: 'v1', auth});

    getEmailIds(Gmail)
    .then(messageIds => getSolutionUrls(Gmail, messageIds))
    .then(urls => producePdfFiles(urls))
    .then(() => mergePdfFiles())
    .then(data => console.dir(data, {depth: null}))
    .catch(e => console.log(' Error: ', e));

}

async function mergePdfFiles() {
    let files;
    try {
        files = fs.readdirSync(`${__dirname}/solutions`);
        files = files.map(f => `${__dirname}/solutions/${f}`);
        await MergePdf(files, {output: `${__dirname}/dcp.pdf`});
        return Promise.resolve('');
    } catch (error) {
        return Promise.reject('Unable to merge solution files. \n', error);
    }
}

async function producePdfFiles(solutionLinks){
    try {
        fs.mkdirSync('./solutions', {recursive: true});    
    } catch (error) {
        return Promise.reject('Unable to create directory for documents. \n', error);
    }

    const browser = await puppeteer.launch();

    const q = async.queue(async (link, callback) => {
        await printSolution(browser, link);
        callback();
    }, cpus);
    
    q.push(solutionLinks);
    
    await q.drain();
    await browser.close();

    return Promise.resolve('Success');
}


async function printSolution(browser, link){
    const startIdx = link.lastIndexOf('/');
    const endIdx = link.indexOf('?');
    const solutionId = link.slice(startIdx + 1, endIdx);
    
    // if the document exists, dont bother
    if(fs.existsSync(path.join(__dirname, 'solutions', `${solutionId}.pdf`))) return Promise.resolve();

    try {
        const page = await browser.newPage();
        await page.goto(link, {waitUntil: 'networkidle2'});
        await page.waitForSelector('.cta');
        await page.click('.cta');
        //make some space
        await page.evaluate(() => {
            const header = document.querySelector('.nav');
            header.parentNode.removeChild(header);
            const footer = document.querySelector('.footer');
            footer.parentNode.removeChild(footer);
            document.querySelector('#app > div').style.marginTop = '10px'; 
            document.querySelector('#app > div').style.marginBottom = '10px';
        });
        await page.pdf({
            path: `./solutions/${solutionId}.pdf`,
            format: 'letter',
            margin: {
                top: '2cm',
                bottom: '2cm'
            },
            printBackground: true
        });
        await page.close();
    } catch (error) {
        console.log('Printing error: ', error);
    }
    return Promise.resolve();
}


async function getSolutionUrls(Gmail, emailIds){

    let solutionUrls = [];

    const q = async.queue(async (m, callback) => {
        const sol = await getEmailSolutionUrl(Gmail, m.id);
        solutionUrls.push(sol);
        callback();
    }, cpus);
    
    q.push(emailIds);
    
    await q.drain();

    solutionUrls = _.compact(_.flatten(solutionUrls));
    return Promise.resolve(solutionUrls);
}



async function getEmailSolutionUrl(Gmail, emailId){
    
    const cachedLink = await cache.get(emailId);
    if(typeof cachedLink !== 'undefined') return Promise.resolve(cachedLink);
    
    const emailPayload = await Gmail.users.messages.get({
        id: emailId,
        userId: 'me'
    });
    const encodedBody  = _.get(emailPayload, 'data.payload.parts[0].body.data');
    if(!encodedBody) return Promise.reject('could not get the email body');
    const body = Buffer.from(encodedBody, 'base64').toString('ascii');

    // TODO: find a better way of finding the link; this can and probably will fail someday
    const startIdx = body.indexOf('[http');
    const endIdx = body.indexOf(']');

    if(startIdx < 0 || endIdx < 0 || startIdx >= endIdx) return Promise.resolve();

    const link = body.slice(startIdx + 1, endIdx);
    if(!link.includes('solution')) return Promise.resolve();
    await cache.put(emailId, link);
    return Promise.resolve(link);
}


async function getEmailIds(Gmail){
    const gmailPayload = await Gmail.users.messages.list(
        {
            userId: 'me',
            q: 'from:founders@dailycodingproblem.com',
            maxResults: 99999999
        }
    );
    const messages = _.get(gmailPayload, 'data.messages', []);
    return Promise.resolve(messages); 
}

