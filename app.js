const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const scrapeIndeed = async (jobTitle, location, country) => {
  const baseUrl = {
    'de': 'https://de.indeed.com',
    'at': 'https://at.indeed.com',
    'ch': 'https://ch.indeed.com'
  }[country] || 'https://de.indeed.com';

  const url = `${baseUrl}/jobs?q=${encodeURIComponent(jobTitle)}&l=${encodeURIComponent(location)}`;

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Set User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Go to the job search page
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Extract job listings
    const jobs = await page.evaluate(() => {
      const jobCards = Array.from(document.querySelectorAll('.job_seen_beacon'));
      return jobCards.map(card => {
        const titleElement = card.querySelector('.jobTitle span');
        const companyElement = card.querySelector('.companyName');
        const locationElement = card.querySelector('.companyLocation');
        const salaryElement = card.querySelector('.salary-snippet');
        const linkElement = card.querySelector('.jcs-JobTitle');

        return {
          title: titleElement ? titleElement.innerText.trim() : 'N/A',
          company: companyElement ? companyElement.innerText.trim() : 'N/A',
          location: locationElement ? locationElement.innerText.trim() : 'N/A',
          salary: salaryElement ? salaryElement.innerText.trim() : 'N/A',
          link: linkElement ? linkElement.href : ''
        };
      });
    });

    await browser.close();
    return jobs;
  } catch (error) {
    console.error(`Error scraping Indeed ${country}:`, error);
    return [];
  }
};

app.post('/scrape', async (req, res) => {
  const { jobTitle, location, countries } = req.body;

  if (!jobTitle || !location || !countries || countries.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const allJobs = [];

    for (const country of countries) {
      const jobs = await scrapeIndeed(jobTitle, location, country);
      allJobs.push(...jobs);
    }

    res.json(allJobs);
  } catch (error) {
    console.error('Error scraping jobs:', error);
    res.status(500).json({ error: 'An error occurred while scraping jobs' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
