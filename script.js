const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csv = require('csv-parser');
const FormData = require('form-data');
require('dotenv').config();

// Data Directories
const deactivationCsvFile = "./deactivation-data";
const selfServeCategoryDirectory = "./new-issue-categories";
const faqDirectory = "./faq-data";
const rideRelatedFaqDirectory = "./faq-data/ride-related-faqs"

// Credentials for APIs
const merchantId = process.env.MERCHANT_ID;
const city = process.env.CITY;
const baseUrl = process.env.BASE_URL;
const authToken = process.env.AUTH_TOKEN;

// Conditionals
const executionFlow = process.env.FLOW_EXECUTION;
const deactivateExistingCategories = parseToBool(process.env.DEACTIVATE_EXISTING_CATEGORIES);

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseToBool(value){
    if (value.toLowerCase() === 'true') return true;
    else if (value.toLowerCase() === 'false') return false;
    else throw new Error('Incorrect value for boolean variable in env.') 
}

// Function to load and process JSON with environment variables
function loadJsonWithEnv(filePath) {
    let fileContent = fs.readFileSync(filePath, 'utf8');

    // Replace placeholders with environment variables and parse as needed
    fileContent = fileContent.replace(/{{(\w+)}}/g, (_, envVar) => {
        const value = process.env[envVar];
        if (value === undefined || value === '') {
            throw new Error(`Environment variable ${envVar} is missing`);
        }

        // Convert environment variable values to the appropriate type
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        // Handle other types if needed
        return value;
    });

    try {
        return JSON.parse(fileContent, (key, value) => {
            // Convert strings that should be booleans
            if (value === 'true') return true;
            if (value === 'false') return false;
            return value;
        });
    } catch (error) {
        throw new Error(`Error parsing JSON from file ${filePath}: ${error.message}`);
    }
}

// Read Existing categories from csv (Deprecated)
async function readCategoryIds() {
    const ids = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(deactivationCsvFile)
            .pipe(csv())
            .on('data', (row) => {
                if ((row['Category Type'] ? row['Category Type'] : row.category_type) === 'Category') {
                    ids.push({ id: row.ID ? row.ID : row.id, isActive: row.is_active === 'True' });
                }
            })
            .on('end', () => {
                console.log('CSV file successfully processed.');
                console.log('Following Categories will be deactivated:', ids);
                resolve(ids);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Fetching categories from list api
async function fetchCategoryIds(categoryType) {
    const url = `${baseUrl}/${merchantId}/${city}/issueV2/category`;

    try {
        const response = await axios.get(url, {
            headers: {
                token: authToken,
            },
        });

        const categories = response.data.categories;
        const filteredCategories = categories
            .filter(category => category.categoryType === categoryType)
            .map(category => ({
                categoryId : category.issueCategoryId,
                categoryName : category.category
            }
            ));

        console.log('Following Categories will be deactivated:', filteredCategories);
        return filteredCategories;
    } catch (error) {
        console.error('Error fetching categories from API:', error);
        throw error;
    }
}

// Updates categories
async function updateCategories(categories, isActive) {
    for (const {categoryId : id, categoryName : categoryName} of categories) {
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
            console.log(`Updated category - ${categoryName} - ID: ${id} to ${isActive ? 'active' : 'inactive'}`);
            await delay(3000);
        } catch (error) {
            console.error(`Error updating category - ${categoryNameID} : ${id}`, error.response?.data || error.message);
            throw error;
        }
    }
}

// Creates categories/faq from jsons
async function createCategoriesFromJson(pathDirectory) {
    const jsonFiles = fs.readdirSync(pathDirectory);
    const createdCategories = [];

    for (const file of jsonFiles) {
        if (path.extname(file) === '.json') {
            const filePath = path.join(pathDirectory, file);
            const requestBody = loadJsonWithEnv(filePath);

            try {
                const response = await axios.post(`${baseUrl}/${merchantId}/${city}/issueV2/category/create`, requestBody, {
                    headers: {
                        'Content-Type': 'application/json',
                        'token': authToken
                    }
                });
                createdCategories.push({categoryName : file, categoryId : response.data.categoryId});
                console.log(`Created category from file: ${file}`);

                await delay(3000);
            } catch (error) {
                console.error(`Error creating category from file: ${file}`, error.response?.data || error.message);
                throw error;
            }
        }
    }
    return createdCategories;
}

// Hits Upsert Issue Message API to insert FAQs
async function createIndividualFAQs(faqPathDirectory, categoryId) {
    const jsonFiles = fs.readdirSync(faqPathDirectory);

    for (const file of jsonFiles) {
        if (path.extname(file) === '.json') {
            const filePath = path.join(faqPathDirectory, file);
            const requestBody = loadJsonWithEnv(filePath);

            const form = new FormData();
            form.append('message', String(requestBody.message));  // Convert to string if necessary
            form.append('messageTitle', String(requestBody.messageTitle));
            form.append('messageAction', String(requestBody.messageAction));
            form.append('categoryId', categoryId);
            form.append('priority', String(requestBody.priority));
            form.append('label', String(requestBody.label));
            form.append('messageTranslations', JSON.stringify(requestBody.messageTranslations));
            form.append('titleTranslations', JSON.stringify(requestBody.titleTranslations));
            form.append('actionTranslations', JSON.stringify(requestBody.actionTranslations));

            // Only append if these fields are not undefined or null
            if (requestBody.referenceOptionId) {
                form.append('referenceOptionId', String(requestBody.referenceOptionId));
            }
            if (requestBody.referenceCategoryId) {
                form.append('referenceCategoryId', String(requestBody.referenceCategoryId));
            }
            form.append('isActive', String(requestBody.isActive));

            try {
                const response = await axios.post(`${baseUrl}/${merchantId}/${city}/issueV2/message/upsert`, form, {
                    headers: {
                        'Content-Type': 'multipart/form-data',  // Update to multipart/form-data for FormData
                        'token': authToken
                    }
                });
                
                console.log(`Created FAQ from file ${file} with id ${response.data.messageId}`);
                await delay(3000);
            } catch (error) {
                console.error('Error:', error.response ? error.response.data : error.message);
            }
        }
    }
}

(async () => {
    try {
        console.log("INSIDE FAQ EXECUTION FLOW-" + executionFlow);

        if (executionFlow === 'ISSUE_FLOW') {
            let oldIssueCategories = [];

            if (deactivateExistingCategories) {
                oldIssueCategories = await fetchCategoryIds("Category");
            }

            const newIssueCategories = await createCategoriesFromJson(selfServeCategoryDirectory);
            console.log("Created New Self Serve Categories with following Ids - " + JSON.stringify(newIssueCategories));
            
            if (deactivateExistingCategories) {
                console.log('Deactivating Old Categories');
                await updateCategories(oldIssueCategories, false);
                console.log('Reactivating new self Serve Old Categories');
                await updateCategories(newIssueCategories, true);
            }

        } else if (executionFlow === 'FAQ') {
            let oldIssueCategories = [];

            if (deactivateExistingCategories) {
                oldIssueCategories = await fetchCategoryIds("FAQ");
            }
            
            const newIssueCategories = await createCategoriesFromJson(faqDirectory);
            console.log("Created New FAQ Categories with following Ids - " + JSON.stringify(newIssueCategories));
            
            const rideRelatedCategory = newIssueCategories.find(category => category.categoryName === "Ride_Related.json");
            console.log("CategoryId for ride related faq category = " + JSON.stringify(rideRelatedCategory));

            if (rideRelatedCategory){
                await createIndividualFAQs(rideRelatedFaqDirectory, rideRelatedCategory.categoryId);
            }

            if (deactivateExistingCategories) {
                console.log('Deactivating Old Categories');
                await updateCategories(oldIssueCategories, false);
                console.log('Reactivating new self Serve Categories');
                await updateCategories(newIssueCategories, true);
            }
        } else {
            throw new Error("Invalid Parameters Supplied");
        }

    } catch (error) {
        console.error('Error during operations:', error);
    }
})();
