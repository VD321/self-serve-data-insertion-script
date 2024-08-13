// NOTE: Please change the referenceOptionIds and referenceCategoryIds to reflect prod ids.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csv = require('csv-parser');
require('dotenv').config();

const csvFilePath = process.env.CSV_FILE_PATH;
const jsonDirectory = process.env.JSON_DIRECTORY;
const faqJsonDirectory = process.env.FAQ_JSON_DIRECTORY;

const masterToken = process.env.MASTER_TOKEN;
const masterUrl = process.env.MASTER_URL;

const merchantId = process.env.MERCHANT_ID;
const city = process.env.CITY;
const baseUrl = process.env.BASE_URL;
const authToken = process.env.AUTH_TOKEN;

async function readCategoryIds() {
    const ids = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                if ((row['Category Type'] ? row['Category Type'] : row.category_type)=== 'Category') {
                    ids.push({ id: row.ID ? row.ID : row.id, isActive: row.is_active === 'True' });
                }
            })
            .on('end', () => {
                console.log('CSV file successfully processed.');
                console.log('Categories to be deactivated:', ids);
                resolve(ids);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

async function updateCategories(ids, isActive) {
    for (const { id } of ids) {
        try {
            await axios.post(`${baseUrl}/${merchantId}/${city}/issueV2/category/update?issueCategoryId=${id}`, {
                isActive,
                translations: []
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'token': authToken
                }
            });
            console.log(`Updated category ID: ${id} to ${isActive ? 'active' : 'inactive'}`);
        } catch (error) {
            console.error(`Error updating category ID: ${id}`, error.response?.data || error.message);
            throw error;
        }
    }
}

async function createCategoriesFromJson(pathDirectory) {
    const jsonFiles = fs.readdirSync(pathDirectory);
    const createdCategories = [];

    for (const file of jsonFiles) {
        if (path.extname(file) === '.json') {
            const filePath = path.join(pathDirectory, file);
            const requestBody = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            try {
                const response = await axios.post(`${baseUrl}/${merchantId}/${city}/issueV2/category/create`, requestBody, {
                    headers: {
                        'Content-Type': 'application/json',
                        'token': authToken
                    }
                });
                createdCategories.push(response.data.id);
                console.log(`Created category from file: ${file}`);
            } catch (error) {
                console.error(`Error creating category from file: ${file}`, error.response?.data || error.message);
                throw error;
            }
        }
    }
    return createdCategories;
}

(async () => {
    try {
        const categoryIds = await readCategoryIds();
        if (categoryIds.length > 0) {
            await updateCategories(categoryIds, false);
            await createCategoriesFromJson(jsonDirectory);
            await createCategoriesFromJson(faqJsonDirectory);
        } else {
            console.log('No categories to deactivate. Skipping category creation.');
        }
        console.log('All operations completed.');
    } catch (error) {
        console.error('Error during operations:', error);
    }
})();
