const cloudinary = require('cloudinary').v2;

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload a file to Cloudinary
 * @param {string} filePath - Path to the file to upload
 * @param {string} folder - Cloudinary folder to store the file
 * @param {string} publicId - Optional public ID for the file
 * @returns {Promise<object>} - Cloudinary upload result
 */
async function uploadToCloudinary(filePath, folder = 'iskolarpath', publicId = null) {
  try {
    const options = {
      folder: folder,
      resource_type: 'auto', // Automatically detect file type (image, pdf, etc.)
      use_filename: true,
      unique_filename: true
    };

    if (publicId) {
      options.public_id = publicId;
    }

    const result = await cloudinary.uploader.upload(filePath, options);
    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - Public ID of the file to delete
 * @returns {Promise<object>} - Cloudinary deletion result
 */
async function deleteFromCloudinary(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
}

/**
 * Extract public ID from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {string} - Public ID
 */
function getPublicIdFromUrl(url) {
  if (!url) return null;
  // URL format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/filename.ext
  const parts = url.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return null;

  // Get everything after 'upload/v{version}/' and remove file extension
  const pathParts = parts.slice(uploadIndex + 2).join('/');
  return pathParts.replace(/\.[^/.]+$/, ''); // Remove file extension
}

module.exports = {
  cloudinary,
  uploadToCloudinary,
  deleteFromCloudinary,
  getPublicIdFromUrl
};
