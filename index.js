const {google} = require('googleapis');
const _ = require('lodash');
const fs = require('fs');
const GmailAuth = require('./gmail-auth');
const DStore = require('./dstore');
const puppeteer = require('puppeteer');



const cache = new DStore('cache.db');

GmailAuth('credentials.json', processEmails);




async function processEmails(auth) {
    const Gmail = google.gmail({version: 'v1', auth});
    
    getEmailIds(Gmail)
    .then(messageIds => getSolutionUrls(Gmail, messageIds))
    .then(urls => producePdfFiles(urls))
    .then(data => console.dir(data, {depth: null}))
    .catch(e => console.log(' Error: ', e));

}


async function producePdfFiles(solutionLinks){
    try {
        await fs.mkdirSync('./solutions', {recursive: true});    
    } catch (error) {
        return Promise.reject('Unable to create directory for documents. \n');
    }
    
    const browser = await puppeteer.launch();

    for(link of solutionLinks){
        const page = await browser.newPage();
        const startIdx = link.lastIndexOf('/');
        const endIdx = link.indexOf('?');
        const solutionId = link.slice(startIdx + 1, endIdx);
        await page.goto(link, {waitUntil: 'networkidle2'});
        await page.pdf({
            path: `./solutions/${solutionId}.pdf`,
            format: 'letter'
        });
        await page.close();
    }

    await browser.close();
    return Promise.resolve('Success');
}


async function getSolutionUrls(Gmail, emailIds){
    let solutionUrls = await Promise.all(emailIds.map(m => getEmailSolutionUrl(Gmail, m.id)));
    // let solutionUrls = [];

    // for(let id of emailIds){
    //     const url = await getEmailSolutionUrl(Gmail, id.id);
    //     solutionUrls.push(url);
    // }

    solutionUrls = _.compact(solutionUrls);
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

