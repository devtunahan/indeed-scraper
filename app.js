const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const scrapeIndeed = async (jobTitle, location, country, filters = {}) => {
  const baseUrl = {
    'de': 'https://de.indeed.com',
    'at': 'https://at.indeed.com',
    'ch': 'https://ch.indeed.com'
  }[country] || 'https://de.indeed.com';

  let url = `${baseUrl}/jobs?q=${encodeURIComponent(jobTitle)}&l=${encodeURIComponent(location)}`;

  // Add filters to the URL
  if (filters.jobType) {
    url += `&jt=${encodeURIComponent(filters.jobType)}`;
  }
  if (filters.salaryEstimate) {
    url += `&salary=${encodeURIComponent(filters.salaryEstimate)}`;
  }
  if (filters.company) {
    url += `&rbc=${encodeURIComponent(filters.company)}`;
  }
  if (filters.experienceLevel) {
    url += `&explvl=${encodeURIComponent(filters.experienceLevel)}`;
  }
  if (filters.datePosted) {
    url += `&fromage=${encodeURIComponent(filters.datePosted)}`;
  }
  if (filters.remote) {
    url += `&remotejob=${encodeURIComponent(filters.remote)}`;
  }

  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    // Set User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const jobs = [];
    let nextPageExists = true;
    let pageNum = 0;

    while (nextPageExists && pageNum < 5) { // Limiting to first 5 pages for this example
      const paginatedUrl = `${url}&start=${pageNum * 10}`;
      console.log(`Navigating to URL: ${paginatedUrl}`);
      await page.goto(paginatedUrl, { waitUntil: 'networkidle2' });

      // Explicitly wait for the job cards to be rendered
      try {
        await page.waitForSelector('.job_seen_beacon, .tapItem', { timeout: 20000 });

        const newJobs = await page.evaluate(() => {
          const jobCards = Array.from(document.querySelectorAll('.job_seen_beacon, .tapItem'));
          return jobCards.map(card => {
            const titleElement = card.querySelector('.jobTitle span');
            const companyElement = card.querySelector('.companyName');
            const locationElement = card.querySelector('.companyLocation');
            const salaryElement = card.querySelector('.salary-snippet, .salary-snippet-container');
            const linkElement = card.querySelector('a.jcs-JobTitle');

            // Enhanced data extraction
            const title = titleElement ? titleElement.innerText.trim() : '';
            const company = companyElement ? companyElement.innerText.trim() : '';
            const location = locationElement ? locationElement.innerText.trim() : '';
            const salary = salaryElement ? salaryElement.innerText.trim() : '';
            const link = linkElement ? linkElement.href : '';

            return {
              title: title || 'Not available',
              company: company || 'Not available',
              location: location || 'Not available',
              salary: salary || 'Not specified',
              link: link || '#'
            };
          });
        });

        newJobs.forEach(job => {
          console.log(`Job Title: ${job.title}, Company: ${job.company}, Location: ${job.location}, Salary: ${job.salary}, Link: ${job.link}`);
        });

        jobs.push(...newJobs);
      } catch (error) {
        console.error(`Error scraping Indeed ${country} page ${pageNum}:`, error);
        const content = await page.content();
        fs.writeFileSync(`error_page_${country}_${pageNum}.html`, content); // Save the HTML content to a file
        break;
      }

      // Check if there is a next page button
      nextPageExists = await page.evaluate(() => {
        const nextButton = document.querySelector('a[aria-label="Next"]');
        return nextButton !== null;
      });

      pageNum++;
    }

    await browser.close();
    return jobs;
  } catch (error) {
    console.error(`Error scraping Indeed ${country}:`, error);
    return [];
  }
};

app.post('/scrape', async (req, res) => {
  const { jobTitle, location, countries, filters } = req.body;

  if (!jobTitle || !location || !countries || countries.length === 0) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const allJobs = [];

    for (const country of countries) {
      const jobs = await scrapeIndeed(jobTitle, location, country, filters);
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
