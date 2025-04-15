const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = 3000;

// Root directory of the project (one level up from server folder)
const projectRoot = path.join(__dirname, '..');

// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files from the project root
app.use(express.static(projectRoot));

// Define data directories to check - adjusted paths for server subfolder
const dataPaths = [
    path.join(projectRoot, '../Covid19_Datasets/Google_Datasets'),
    path.join(projectRoot, 'Covid19_Datasets/Google_Datasets'),
    path.join(projectRoot, '../../Covid19_Datasets/Google_Datasets'),
    // Add more potential paths
    path.join(projectRoot, 'data'),
    path.join(projectRoot, 'datasets'),
    path.join(projectRoot, 'server/data')
];

// Find the first valid data directory
let validDataPath = null;
for (const dataPath of dataPaths) {
    if (fs.existsSync(dataPath)) {
        validDataPath = dataPath;
        console.log(`Found data directory at: ${dataPath}`);
        
        // List files in the directory for debugging
        const files = fs.readdirSync(dataPath);
        console.log(`Files found in directory: ${files.join(', ')}`);
        
        break;
    }
}

if (!validDataPath) {
    console.error('No valid data directory found. Please place data files in one of these locations:');
    dataPaths.forEach(path => console.error(`- ${path}`));
}

// API endpoint to get epidemiological data
app.get('/api/epidem', (req, res) => {
    if (!validDataPath) {
        return res.status(404).json({ error: 'Data directory not found' });
    }
    
    const filePath = path.join(validDataPath, 'country_level_epidem.csv');
    
    if (!fs.existsSync(filePath)) {
        console.error(`Epidemiological data file not found at ${filePath}`);
        return res.status(404).json({ error: 'Epidemiological data file not found' });
    }
    
    console.log(`Serving epidem data file from: ${filePath}`);
    
    // Read the first few lines to validate structure (optional)
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8').split('\n').slice(0, 3).join('\n');
        console.log("Sample epidem data structure:");
        console.log(fileContent);
    } catch (error) {
        console.error("Error reading sample data:", error);
    }
    
    // Send the CSV file
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(filePath);
});

// API endpoint to get hospitalization data
app.get('/api/hospitalizations', (req, res) => {
    if (!validDataPath) {
        return res.status(404).json({ error: 'Data directory not found' });
    }
    
    const filePath = path.join(validDataPath, 'country_level_hopitalizations.csv');
    
    if (!fs.existsSync(filePath)) {
        console.error(`Hospitalization data file not found at ${filePath}`);
        
        // Check if the filename might be misspelled (hospitalizations vs hopitalizations)
        const alternateFilePath = path.join(validDataPath, 'country_level_hospitalizations.csv');
        if (fs.existsSync(alternateFilePath)) {
            console.log(`Found alternate spelling: ${alternateFilePath}`);
            
            // Read the first few lines to validate structure (optional)
            try {
                const fileContent = fs.readFileSync(alternateFilePath, 'utf8').split('\n').slice(0, 3).join('\n');
                console.log("Sample hospitalization data structure:");
                console.log(fileContent);
            } catch (error) {
                console.error("Error reading sample data:", error);
            }
            
            res.setHeader('Content-Type', 'text/csv');
            return res.sendFile(alternateFilePath);
        }
        
        return res.status(404).json({ error: 'Hospitalization data file not found' });
    }
    
    console.log(`Serving hospitalization data file from: ${filePath}`);
    
    // Read the first few lines to validate structure (optional)
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8').split('\n').slice(0, 3).join('\n');
        console.log("Sample hospitalization data structure:");
        console.log(fileContent);
    } catch (error) {
        console.error("Error reading sample data:", error);
    }
    
    // Send the CSV file
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(filePath);
});

// API endpoint to get vaccination data
app.get('/api/vaccinations', (req, res) => {
    if (!validDataPath) {
        return res.status(404).json({ error: 'Data directory not found' });
    }
    
    const filePath = path.join(validDataPath, 'country_level_vaccinations.csv');
    
    if (!fs.existsSync(filePath)) {
        console.error(`Vaccination data file not found at ${filePath}`);
        return res.status(404).json({ 
            error: 'Vaccination data file not found',
            message: 'Please create a file named vaccinations.csv in your data directory'
        });
    }
    
    console.log(`Serving vaccination data file from: ${filePath}`);
    
    // Read the first few lines to validate structure (optional)
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8').split('\n').slice(0, 3).join('\n');
        console.log("Sample vaccination data structure:");
        console.log(fileContent);
    } catch (error) {
        console.error("Error reading sample data:", error);
    }
    
    // Send the CSV file
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(filePath);
});

// API endpoint to get country index data
app.get('/api/country-index', (req, res) => {
    if (!validDataPath) {
        return res.status(404).json({ error: 'Data directory not found' });
    }
    
    const filePath = path.join(validDataPath, 'small_index.csv');
    
    if (!fs.existsSync(filePath)) {
        console.error(`Country index file not found at ${filePath}`);
        return res.status(404).json({ error: 'Country index file not found' });
    }
    
    console.log(`Serving country index file from: ${filePath}`);
    
    // Read the first few lines to validate structure (optional)
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8').split('\n').slice(0, 5).join('\n');
        console.log("Sample country index data structure:");
        console.log(fileContent);
    } catch (error) {
        console.error("Error reading sample data:", error);
    }
    
    // Send the CSV file
    res.setHeader('Content-Type', 'text/csv');
    res.sendFile(filePath);
});

// API endpoint to list available files in the data directory
app.get('/api/list-files', (req, res) => {
    if (!validDataPath) {
        return res.status(404).json({ error: 'Data directory not found' });
    }
    
    try {
        const files = fs.readdirSync(validDataPath);
        res.json({ 
            directory: validDataPath,
            files: files 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve index.html for all other routes (for single-page application behavior)
app.get('*', (req, res) => {
    res.sendFile(path.join(projectRoot, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Open your browser and navigate to http://localhost:${PORT}`);
    console.log(`Data API is available at:`);
    console.log(`- http://localhost:${PORT}/api/epidem`);
    console.log(`- http://localhost:${PORT}/api/hospitalizations`);
    console.log(`- http://localhost:${PORT}/api/vaccinations`);
    console.log(`- http://localhost:${PORT}/api/country-index`);
    console.log(`- http://localhost:${PORT}/api/list-files (for debugging)`);
});
