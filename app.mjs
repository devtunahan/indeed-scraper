import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import cors from 'cors';
import fs from 'fs';
import { performance } from 'perf_hooks';
import pLimit from 'p-limit';
import winston from 'winston';

// Configure winston logger
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'scraping.log' })
  ]
});

puppeteer.use(StealthPlugin());

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1'
];

const randomDelay = () => Math.floor(Math.random() * 1000) + 500;
const concurrencyLimit = 5; // Increase concurrency limit
const limit = pLimit(concurrencyLimit);

const scrapeJobDetails = async (browser, jobUrl) => {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);
    await page.goto(jobUrl, { waitUntil: 'networkidle2', timeout: 30000 }); // Reduce timeout
    await page.waitForSelector('h1', { timeout: 10000 });

    const jobDetails = await page.evaluate(() => {
      const titleElement = document.querySelector('h1');
      const companyElement = document.querySelector('.jobsearch-CompanyReview--heading, .icl-u-lg-mr--sm.icl-u-xs-mr--xs, .jobsearch-InlineCompanyRating div:first-child');
      const locationElement = document.querySelector('div[data-testid="inlineHeader-companyLocation"]');

      const title = titleElement ? titleElement.innerText.trim() : 'Not available';
      const company = companyElement ? companyElement.innerText.trim() : 'Not available';
      const location = locationElement ? locationElement.innerText.trim() : 'Not available';

      return { title, company, location };
    });

    await page.close();
    return jobDetails;
  } catch (error) {
    logger.error(`Error scraping job details from ${jobUrl}: ${error.message}`);
    await page.close();
    return {
      title: 'Not available',
      company: 'Not available',
      location: 'Not available'
    };
  }
};

const scrapeIndeed = async (jobTitle, location, country, filters = {}) => {
  const baseUrl = {
    'de': 'https://de.indeed.com',
    'at': 'https://at.indeed.com',
    'ch': 'https://ch.indeed.com'
  }[country] || 'https://de.indeed.com';

  let url = `${baseUrl}/jobs?q=${encodeURIComponent(jobTitle)}&l=${encodeURIComponent(location)}`;

  // Map filters to URL parameters
  Object.keys(filters).forEach(filter => {
    url += `&${encodeURIComponent(filter)}=${encodeURIComponent(filters[filter])}`;
  });

  logger.info(`Generated URL: ${url}`);

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent(userAgents[Math.floor(Math.random() * userAgents.length)]);

    const jobs = [];
    const uniqueLinks = new Set();
    let nextPageExists = true;
    let pageNum = 0;

    while (nextPageExists && pageNum < 20) { // Add a maximum page limit to prevent infinite loops
      const paginatedUrl = pageNum === 0 ? url : `${url}&start=${pageNum * 10}`;
      logger.info(`Navigating to URL: ${paginatedUrl}`);
      
      try {
        await page.goto(paginatedUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      } catch (navError) {
        logger.error(`Navigation error: ${navError.message}`);
        break;
      }

      try {
        await page.waitForSelector('.job_seen_beacon, .tapItem', { timeout: 10000 });

        const jobCards = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.job_seen_beacon, .tapItem')).map(card => {
            const linkElement = card.querySelector('a.jcs-JobTitle');
            const link = linkElement ? linkElement.href : '#';
            return { link };
          });
        });

        logger.info(`Found ${jobCards.length} job cards on page ${pageNum + 1}`);

        const jobDetailsPromises = jobCards.map(job => limit(async () => {
          await new Promise(resolve => setTimeout(resolve, randomDelay()));
          const jobDetails = await scrapeJobDetails(browser, job.link);
          return { ...jobDetails, link: job.link, source: 'Indeed' };
        }));

        const jobDetails = await Promise.all(jobDetailsPromises);
        jobDetails.forEach(job => {
          if (!uniqueLinks.has(job.link) && job.title !== 'Not available') {
            uniqueLinks.add(job.link);
            jobs.push(job);
          }
        });

        logger.info(`Page ${pageNum + 1}: Scraped ${jobDetails.length} jobs`);

        nextPageExists = await page.evaluate(() => {
          const nextButton = document.querySelector('a[data-testid="pagination-page-next"]');
          return nextButton !== null;
        });

        logger.debug(`Next button exists: ${nextPageExists}`);

        pageNum++;
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      } catch (error) {
        logger.error(`Error scraping Indeed ${country} page ${pageNum}: ${error.message}`);
        const content = await page.content();
        fs.writeFileSync(`error_page_${country}_${pageNum}.html`, content);
        break;
      }
    }

    await browser.close();
    logger.info(`Total jobs scraped for ${country}: ${jobs.length}`);
    return { jobs, totalPages: pageNum };
  } catch (error) {
    logger.error(`Error scraping Indeed ${country}: ${error.message}`);
    return { jobs: [], totalPages: 0 };
  }
};

app.post('/scrape', async (req, res) => {
  const { jobTitle, location, countries, filters } = req.body;

  if (!jobTitle || !location || !countries || countries.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const startTime = performance.now();

  try {
    const allJobs = [];
    let totalPages = 0;

    const scrapePromises = countries.map(country => limit(async () => {
      logger.info(`Starting scrape for ${country}`);
      const { jobs, totalPages: pages } = await scrapeIndeed(jobTitle, location, country, filters);
      logger.info(`Finished scrape for ${country}, found ${jobs.length} jobs`);
      totalPages += pages;
      allJobs.push(...jobs);
    }));

    await Promise.all(scrapePromises);

    const endTime = performance.now();
    const scrapeDuration = ((endTime - startTime) / 1000).toFixed(2);

    res.json({
      totalJobs: allJobs.length,
      scrapeDuration: `${scrapeDuration} seconds`,
      totalPages,
      jobs: allJobs
    });
  } catch (error) {
    logger.error(`Error scraping jobs: ${error.message}`);
    res.status(500).json({ error: 'An error occurred while scraping jobs' });
  }
});

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
