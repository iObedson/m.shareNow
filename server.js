require('dotenv').config()

// using express JS
const express = require("express");
const app = express();

// express formidable is used to parse the form data values
const formidable = require("express-formidable");
app.use(formidable());

// use mongo DB as database
const mongodb = require("mongodb");
const mongoClient = mongodb.MongoClient;

// the unique ID for each mongo DB document
const ObjectId = mongodb.ObjectId;

// receiving http requests
const httpObj = require("http");
const http = httpObj.createServer(app);

// to encrypt/decrypt passwords
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");

const nodemailerFrom = process.env.AUTHORIZED_EMAIL;
const nodemailerObject = {
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.AUTHORIZED_EMAIL,
    pass: process.env.NODEMAILER_PASS,
  },
};

// to store files
const fileSystem = require("fs");
const rimraf = require("rimraf");
const path = require("path");

// recursive function to get the folder from uploaded
function recursiveGetFolder(files, _id) {
  let singleFile = null;

  for (let a = 0; a < files.length; a++) {
    const file = files[a];

    // return if file type is folder and ID is found
    if (file.type == "folder") {
      if (file._id == _id) {
        return file;
      }

      // if file has files, then do the recursion
      if (file.files.length > 0) {
        singleFile = recursiveGetFolder(file.files, _id);
        // return the file if found in sub-folders
        if (singleFile != null) {
          return singleFile;
        }
      }
    }
  }
}

// function to add new uploaded object and return the updated array
function getUpdatedArray(arr, _id, uploadedObj) {
  for (let a = 0; a < arr.length; a++) {
    // push in files array if type is folder and ID is found
    if (arr[a].type == "folder") {
      if (arr[a]._id == _id) {
        arr[a].files.push(uploadedObj);
        arr[a]._id = ObjectId(arr[a]._id);
      }

      // if it has files, then do the recursion
      if (arr[a].files.length > 0) {
        arr[a]._id = ObjectId(arr[a]._id);
        getUpdatedArray(arr[a].files, _id, uploadedObj);
      }
    }
  }

  return arr;
}

// to start the session
const session = require("express-session");
app.use(
    session({
      secret: "secret key",
      resave: false,
      saveUninitialized: false,
    }),
);

// define the publically accessible folders
app.use("/public/css", express.static(__dirname + "/public/css"));
app.use("/public/js", express.static(__dirname + "/public/js"));
app.use("/public/img", express.static(__dirname + "/public/img"));
app.use(
    "/public/font-awesome-4.7.0",
    express.static(__dirname + "/public/font-awesome-4.7.0"),
);
app.use("/public/fonts", express.static(__dirname + "/public/fonts"));

// using EJS as templating engine
app.set("view engine", "ejs");

// main URL of website
const mainURL = process.env.client_URL;

// global database object
let database = null;

// app middleware to attach main URL and user object with each request
app.use((request, result, next) => {
  request.mainURL = mainURL;
  request.isLogin = typeof request.session.user !== "undefined";
  request.user = request.session.user;

  // continue the request
  next();
});

// function to add new uploaded object and return the updated array
// eslint-disable-next-line require-jsdoc
function getUpdatedArray(arr, _id, uploadedObj) {
  for (let a = 0; a < arr.length; a++) {
    // push in files array if type is folder and ID is found
    if (arr[a].type == "folder") {
      if (arr[a]._id == _id) {
        arr[a].files.push(uploadedObj);
        arr[a]._id = ObjectId(arr[a]._id);
      }

      // if it has files, then do the recursion
      if (arr[a].files.length > 0) {
        arr[a]._id = ObjectId(arr[a]._id);
        getUpdatedArray(arr[a].files, _id, uploadedObj);
      }
    }
  }

  return arr;
}

// recursive function to remove the file and return the updated array
// eslint-disable-next-line require-jsdoc
function removeFileReturnUpdated(arr, _id) {
  for (let a = 0; a < arr.length; a++) {
    if (arr[a].type != "folder" && arr[a]._id == _id) {
      // remove the file from uploads folder
      try {
        fileSystem.unlinkSync(arr[a].filePath);
      } catch (exp) {
        //
      }
      // remove the file from array
      arr.splice(a, 1);
      break;
    }

    // do the recursion if it has sub-folders
    if (arr[a].type == "folder" && arr[a].files.length > 0) {
      // eslint-disable-next-line new-cap
      arr[a]._id = ObjectId(arr[a]._id);
      removeFileReturnUpdated(arr[a].files, _id);
    }
  }

  return arr;
}

//  recursive function to remove the folder and return the updated array
// eslint-disable-next-line require-jsdoc
function removeFolderReturnUpdated(arr, _id) {
  for (let a = 0; a < arr.length; a++) {
    if (arr[a].type == "folder") {
      if (arr[a]._id == _id) {
        // remove the folder with all sub-directories in it
        rimraf(arr[a].folderPath, () => {
          // console.log("done")
        });
        arr.splice(a, 1);
        break;
      }

      if (arr[a].files.length > 0) {
        arr[a]._id = ObjectId(arr[a]._id);
        removeFolderReturnUpdated(arr[a].files, _id);
      }
    }
  }

  return arr;
}
// recursive function to search uploaded files
function recursiveSearch(files, query) {
  let singleFile = null;

  for (let a = 0; a < files.length; a++) {
    const file = files[a];

    if (file.type == "folder") {
      // search folder case-insensitive
      if (file.folderName.toLowerCase().search(query.toLowerCase()) > -1) {
        return file;
      }

      if (file.files.length > 0) {
        singleFile = recursiveSearch(file.files, query);
        if (singleFile != null) {
          // need parent folder in case of files
          if (singleFile.type != "folder") {
            singleFile.parent = file;
          }
          return singleFile;
        }
      }
    } else {
      if (file.name.toLowerCase().search(query.toLowerCase()) > -1) {
        return file;
      }
    }
  }
}

// recursive function to search shared files
function recursiveSearchShared(files, query) {
  let singleFile = null;

  for (let a = 0; a < files.length; a++) {
    const file =
      typeof files[a].file === "undefined" ? files[a] : files[a].file;

    if (file.type == "folder") {
      if (file.folderName.toLowerCase().search(query.toLowerCase()) > -1) {
        return file;
      }

      if (file.files.length > 0) {
        singleFile = recursiveSearchShared(file.files, query);
        if (singleFile != null) {
          if (singleFile.type != "folder") {
            singleFile.parent = file;
          }
          return singleFile;
        }
      }
    } else {
      if (file.name.toLowerCase().search(query.toLowerCase()) > -1) {
        return file;
      }
    }
  }
}

//  recursive function to remove the shared file and return the updated array
function removeSharedFileReturnUpdated(arr, _id) {
  for (let a = 0; a < arr.length; a++) {
    const file = typeof arr[a].file == "undefined" ? arr[a] : arr[a].file;

    if (file.type != "folder" && file._id == _id) {
      arr.splice(a, 1);
      break;
    }
    // do the recursion if it has sub-folders
    if (file.type == "folder" && file.files.length > 0) {
      arr[a]._id = ObjectId(arr[a]._id);
      removeSharedFileReturnUpdated(file.files, _id);
    }
  }

  return arr;
}

//  recursive function to remove the shared folder and return the updated array
function removeSharedFolderReturnUpdated(arr, _id) {
  for (let a = 0; a < arr.length; a++) {
    const file = typeof arr[a].file == "undefined" ? arr[a] : arr[a].file;
    if (file.type == "folder") {
      if (file._id == _id) {
        arr.splice(a, 1);
        break;
      }

      // do the recursion if it has sub-folders
      if (file.files.length > 0) {
        file._id = ObjectId(file._id);
        removeSharedFolderReturnUpdated(file.files, _id);
      }
    }
  }

  return arr;
}

//  recursive function to push in  moved folder files array

function updateMovedToFolderParent_ReturnUpdated(arr, _id, moveFolder) {
  for (let a = 0; a < arr.length; a++) {
    if (arr[a].type == "folder") {
      if (arr[a]._id == _id) {
        moveFolder.folderPath = arr[a].folderPath + "/" + moveFolder.folderName;
        arr[a].files.push(moveFolder);
        break;
      }

      // if it has further files, do the recursion
      if (arr[a].files.length > 0) {
        arr[a]._id = ObjectId(arr[a]._id);
        updateMovedToFolderParent_ReturnUpdated(arr[a].files, _id, moveFolder);
      }
    }
  }

  return arr;
}

//  recursive function to move the folder and return updated array

function moveFolderReturnUpdated(arr, _id, moveFolder, moveToFolder) {
  for (let a = 0; a < arr.length; a++) {
    if (arr[a].type == "folder") {
      if (arr[a]._id == _id) {
        // rename() will move the file
        const newPath = moveToFolder.folderPath + "/" + arr[a].folderName;
        fileSystem.rename(arr[a].folderPath, newPath, () => {
          // console.log("Folder has been moved successfully.")
        });
        arr.splice(a, 1);
        break;
      }

      if (arr[a].files.length > 0) {
        arr[a]._id = ObjectId(arr[a]._id);
        moveFolderReturnUpdated(arr[a].files, _id, moveFolder, moveToFolder);
      }
    }
  }

  return arr;
}

// recursive function to get all folders
function recursiveGetAllFolders(files, _id) {
  const folders = [];

  for (let a = 0; a < files.length; a++) {
    const file = files[a];

    if (file.type == "folder") {
      // get all, excerpt the selected
      if (file._id != _id) {
        folders.push(file);
        if (file.files.length > 0) {
          const tempFolders = recursiveGetAllFolders(file.files, _id);
          // push the returned folders too in array
          for (let b = 0; b < tempFolders.length; b++) {
            folders.push(tempFolders[b]);
          }
        }
      }
    }
  }
  return folders;
}
// start the http server
app.listen(3000, () => {
  console.log("Server started at " + mainURL);
  const db = new MongoClient(process.env.MONGO_URI);

  // connect with mongo DB server
  mongoClient.connect(
    process.env.MONGO_URI,
      {
        useUnifiedTopology: true,
      },
      (error, client) => {
      // connect database (it will automatically create the database if not exists)
        database = client.db("file_transfer");
        console.log("Database connected.");

        // get all folders
        app.post("/GetAllFolders", async (request, result) => {
          const _id = request.fields._id;
          const type = request.fields.type;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            const tempAllFolders = recursiveGetAllFolders(user.uploaded, _id);
            const folders = [];
            for (let a = 0; a < tempAllFolders.length; a++) {
              folders.push({
                _id: tempAllFolders[a]._id,
                folderName: tempAllFolders[a].folderName,
              });
            }
            result.json({
              status: "success",
              message: "Record has been fetched",
              folders: folders,
            });
            return false;
          }
          result.json({
            status: "error",
            message: "Please login to perform this action",
          });
        });

        // move file from one folder to another
        app.post("/MoveFile", async (request, result) => {
          const _id = request.fields._id;
          const type = request.fields.type;
          const folder = request.fields.folder;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            let updatedArray = user.uploaded;

            if (type == "folder") {
            // get both folders
              const moveFolder = await recursiveGetFolder(user.uploaded, _id);
              const moveToFolder = await recursiveGetFolder(
                  user.uploaded,
                  folder,
              );

              // move folder in uploads folder
              updatedArray = await moveFolderReturnUpdated(
                  user.uploaded,
                  _id,
                  moveFolder,
                  moveToFolder,
              );

              // update folder array where the file is moved
              updatedArray = await updateMovedToFolderParent_ReturnUpdated(
                  updatedArray,
                  folder,
                  moveFolder,
              );
            }

            await database.collection("users").updateOne(
                {
                  _id: ObjectId(request.session.user._id),
                },
                {
                  $set: {
                    uploaded: updatedArray,
                  },
                },
            );

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }
          result.redirect("/Login");
        });
        // delete shared file
        app.post("/DeleteSharedFile", async (request, result) => {
          const _id = request.fields._id;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            const updatedArray = await removeSharedFileReturnUpdated(
                user.sharedWithMe,
                _id,
            );
            for (let a = 0; a < updatedArray.length; a++) {
              updatedArray[a]._id = ObjectId(updatedArray[a]._id);
            }

            await database.collection("users").updateOne(
                {
                  _id: ObjectId(request.session.user._id),
                },
                {
                  $set: {
                    sharedWithMe: updatedArray,
                  },
                },
            );

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }
          result.redirect("/Login");
        });
        // delete shared folder
        app.post("/DeleteSharedDirectory", async (request, result) => {
          const _id = request.fields._id;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            const updatedArray = await removeSharedFolderReturnUpdated(
                user.sharedWithMe,
                _id,
            );
            for (let a = 0; a < updatedArray.length; a++) {
              updatedArray[a]._id = ObjectId(updatedArray[a]._id);
            }

            await database.collection("users").updateOne(
                {
                  _id: ObjectId(request.session.user._id),
                },
                {
                  $set: {
                    sharedWithMe: updatedArray,
                  },
                },
            );

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }
          result.redirect("/Login");
        });

        // recursive function to get the shared folder
        function recursiveGetSharedFolder(files, _id) {
          let singleFile = null;

          for (let a = 0; a < files.length; a++) {
            const file =
            typeof files[a].file === "undefined" ? files[a] : files[a].file;

            // return if file type is not folder and ID is found
            if (file.type == "folder") {
              if (file._id == _id) {
                return file;
              }
              // if it has files, then do the recursion
              if (file.files.length > 0) {
                singleFile = recursiveGetSharedFolder(file.files, _id);
                // return the file if found in sub-folders
                if (singleFile != null) {
                  return singleFile;
                }
              }
            }
          }
        }

        // recursive function to get the file from uploaded
        function recursiveGetFile(files, _id) {
          let singleFile = null;

          for (let a = 0; a < files.length; a++) {
            const file = files[a];

            // return if file type is not folder and ID is found
            if (file.type != "folder") {
              if (file._id == _id) {
                return file;
              }
            }

            // if it is a folder and have files, then do the recursion
            if (file.type == "folder" && file.files.length > 0) {
              singleFile = recursiveGetFile(file.files, _id);
              // return the file if found in sub-folders
              if (singleFile != null) {
                return singleFile;
              }
            }
          }
        }
        // recursive function to get the shared file
        function recursiveGetSharedFile(files, _id) {
          let singleFile = null;

          for (let a = 0; a < files.length; a++) {
            const file =
            typeof files[a].file === "undefined" ? files[a] : files[a].file;

            // return if file type is not folder and ID is found
            if (file.type != "folder") {
              if (file._id == _id) {
                return file;
              }
            }

            // if it is a folder and have files, then do the recursion
            if (file.type == "folder" && file.files.length > 0) {
              singleFile = recursiveGetSharedFile(file.files, _id);
              // return the file if found in sub-folders
              if (singleFile != null) {
                return singleFile;
              }
            }
          }
        }

        // recursive to rename sub-folders

        function renameSubFolders(arr, oldName, newName) {
          for (let a = 0; a < arr.length; a++) {
          // set new folder path by splitting it in parts by "/"
            const pathParts =
            arr[a].type == "folder" ?
              arr[a].folderPath.split("/") :
              arr[a].filePath.split("/");

            let newPath = "";
            for (let b = 0; b < pathParts.length; b++) {
            // replace the old name with new name
              if (pathParts[b] == oldName) {
                pathParts[b] = newName;
              }
              newPath += pathParts[b];
              // append "/" at the end, except the last index
              if (b < pathParts.length - 1) {
                newPath += "/";
              }
            }
            if (arr[a].type == "folder") {
              arr[a].folderPath = newPath;

              if (arr[a].files.length > 0) {
                renameSubFolders(arr[a].files, _id, newName);
              }
            } else {
              arr[a].filePath = newPath;
            }
          }
        }
        // recursive function to rename folder and return updated array
        function renameFolderReturnUpdated(arr, _id, newName) {
        // loop through all files
          for (let a = 0; a < arr.length; a++) {
            if (arr[a].type == " folder") {
              if (arr[a]._id == _id) {
                const oldFolderName = arr[a].folderName;
                const folderPathParts = arr[a].folderPath.split("/");

                let newFolderPath = "";
                for (let b = 0; b < folderPathParts.length; b++) {
                // replace the old path with new
                  if (folderPathParts[b] == oldFolderName) {
                    folderPathParts[b] = newName;
                  }
                  newFolderPath += folderPathParts[b];
                  // appen "/" at the end, except for last index
                  if (b < folderPathParts.length - 1) {
                    newFolderPath += "/";
                  }
                }
                // rename the folder
                fileSystem.rename(arr[a].folderPath, newFolderPath, (error) => {
                //
                });

                // update the array values
                arr[a].folderName = newName;
                arr[a].folderPath = newFolderPath;

                // update the array values
                renameSubFolders(arr[a].files, oldFolderName, newName);
                break;
              }
              if (arr[a].files.length > 0) {
                renameFolderReturnUpdated(arr[a].files, _id, newName);
              }
            }
          }
          return arr;
        }
        // recursive function to rename file and return updated array
        function renameFileReturnUpdated(arr, _id, newName) {
          for (let a = 0; a < arr.length; a++) {
            if (arr[a].type != "folder") {
              if (arr[a]._id == _id) {
                const oldFileName = arr[a].name;
                const filePathParts = arr[a].filePath.split("/");

                let newFilePath = "";
                for (let b = 0; b < filePathParts.length; b++) {
                // replace the old path with new
                  if (filePathParts[b] == oldFileName) {
                    filePathParts[b] = newName;
                  }
                  newFilePath += filePathParts[b];
                  // appen "/" at the end, except for last index
                  if (b < filePathParts.length - 1) {
                    newFilePath += "/";
                  }
                }
                // rename the file
                fileSystem.rename(arr[a].filePath, newFilePath, (error) => {
                //
                });

                // update the array values
                arr[a].name = newName;
                arr[a].filePath = newFilePath;
                break;
              }
            }
            // do the recursion, if folder has subfolders
            if (arr[a].type == "folder" && arr[a].files.length > 0) {
              renameFileReturnUpdated(arr[a].files, _id, newName);
            }
          }
          return arr;
        }

        // Remove shared access
        app.post("/RemoveSharedAccess", async (request, result) => {
          const _id = request.fields._id;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              $and: [
                {
                  "sharedWithMe._id": ObjectId(_id),
                },
                {
                  "sharedWithMe.sharedBy._id": ObjectId(request.session.user._id),
                },
              ],
            });

            for (let a = 0; a < user.sharedWithMe.length; a++) {
              if (user.sharedWithMe[a]._id == _id) {
                user.sharedWithMe.splice(a, 1);
              }
            }
            await database.collection("users").findOneAndUpdate(
                {
                  $and: [
                    {
                      "sharedWithMe._id": ObjectId(_id),
                    },
                    {
                      "sharedWithMe.sharedBy._id": ObjectId(
                          request.session.user._id,
                      ),
                    },
                  ],
                },
                {
                  $set: {
                    sharedWithMe: user.sharedWithMe,
                  },
                },
            );

            request.session.status = "success";
            request.session.message = "Shared access has been removed";

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }
          result.redirect("/Login");
        });

        // get users whom file has been shared
        app.post("/GetFileSharedWith", async (request, result) => {
          const _id = request.fields._id;

          if (request.session.user) {
            const tempUsers = await database
                .collection("users")
                .find({
                  $and: [
                    {
                      "sharedWithMe.file._id": ObjectId(_id),
                    },
                    {
                      "sharedWithMe.sharedBy._id": ObjectId(
                          request.session.user._id,
                      ),
                    },
                  ],
                })
                .toArray();

            const users = [];
            for (let a = 0; a < tempUsers.length; a++) {
              let sharedObj = null;
              for (let b = 0; b < tempUsers[a].sharedWithMe.length; b++) {
                if (tempUsers[a].sharedWithMe[b].file._id == _id) {
                  sharedObj = {
                    _id: tempUsers[a].sharedWithMe[b]._id,
                    sharedAt: tempUsers[a].sharedWithMe[b].createdAt,
                  };
                }
              }
              users.push({
                _id: tempUsers[a]._id,
                name: tempUsers[a].name,
                email: tempUsers[a].email,
                sharedObj: sharedObj,
              });
            }
            result.json({
              status: "success",
              message: "Record has been fetched",
              users: users,
            });
            return false;
          }
          result.json({
            status: "error",
            message: "Please login to perform this action",
          });
        });

        // share the file w
        app.post("/Share", async (request, result) => {
          const _id = request.fields._id;
          const type = request.fields.type;
          const email = request.fields.email;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              email: email,
            });
            if (user == null) {
              request.session.status = "error";
              request.session.message = "User" + email + "does not exists.";
              result.redirect("/MyUploads");

              return false;
            }
            if (!user.isVerified) {
              request.session.status = "error";
              request.session.message =
              "User" + user.name + "account is not verified.";
              result.redirect("/MyUploads");

              return false;
            }
            const me = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });
            let file = null;
            if (type == "folder") {
              file = await recursiveGetFolder(me.uploaded, _id);
            } else {
              file = await recursiveGetFile(me.uploaded, _id);
            }

            if (file == null) {
              request.session.status = "error";
              request.session.message =
              "User" + user.name + "File does not exists.";
              result.redirect("/MyUploads");

              return false;
            }
            file._id = ObjectId(file._id);

            const sharedBy = me;

            await database.collection("users").findOneAndUpdate(
                {
                  _id: user._id,
                },
                {
                  $push: {
                    sharedWithMe: {
                      _id: ObjectId(),
                      file: file,
                      sharedBy: {
                        _id: ObjectId(sharedBy._id),
                        name: sharedBy.name,
                        email: sharedBy.email,
                      },
                      createdAt: new Date().getTime(),
                    },
                  },
                },
            );

            request.session.status = "success";
            request.session.message =
            "File has been shared with " + user.name + ".";

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }
          result.redirect("/Login");
        });

        // Get User for confirmation
        app.post("/GetUser", async (request, result) => {
          const email = request.fields.email;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              email: email,
            });
            if (user == null) {
              result.json({
                status: "error",
                message: "User" + email + "does not exists.",
              });
              return false;
            }
            if (!user.isVerified) {
              result.json({
                status: "error",
                message: "User" + user.name + "account is not verified.",
              });
              return false;
            }
            result.json({
              status: "success",
              message: "Data has been fetched.",
              user: {
                _id: user._id,
                name: user.name,
                email: user.email,
              },
            });
            return false;
          }
          result.json({
            status: "error",
            message: "Please login to perform this action.",
          });
          return false;
        });

        app.get("/pro-versions", (request, result) => {
          result.render("proVersions", {
            request: request,
          });
        });
        app.get("/MyUploads/:_id?", async (request, result) => {
          const _id = request.params._id;
          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            let uploaded = null;
            let folderName = "";
            let createdAt = "";
            if (typeof _id == "undefined") {
              uploaded = user.uploaded;
            } else {
              const folderObj = await recursiveGetFolder(user.uploaded, _id);

              if (folderObj == null) {
                request.status = "error";
                request.message = "Folder not found";
                result.render("MyUploads", {
                  request: request,
                  uploaded: uploaded,
                  _id: _id,
                  folderName: folderName,
                  createdAt: createdAt,
                });
                return false;
              }

              uploaded = folderObj.files;
              folderName = folderObj.folderName;
              createdAt = folderObj.createdAt;
            }
            if (uploaded == null) {
              request.status = "error";
              request.message = "Directory not found";
              result.render("MyUploads", {
                request: request,
                uploaded: uploaded,
                _id: _id,
                folderName: folderName,
                createdAt: createdAt,
              });
              return false;
            }
            result.render("MyUploads", {
              request: request,
              uploaded: uploaded,
              _id: _id,
              folderName: folderName,
              createdAt: createdAt,
            });
            return false;
          }

          result.redirect("/Login");
        });

        app.post("/CreateFolder", async (request, result) => {
          const name = request.fields.name;
          const _id = request.fields._id;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });
            const uploadedObj = {
              _id: ObjectId(),
              type: "folder",
              folderName: name,
              files: [],
              folderPath: "",
              createdAt: new Date().getTime(),
            };

            let folderPath = "";
            let updatedArray = [];
            if (_id == "") {
              folderPath = "public/uploads/" + user.email + "/" + name;
              uploadedObj.folderPath = folderPath;

              if (!fileSystem.existsSync("public/uploads/" + user.email)) {
                fileSystem.mkdirSync("public/uploads/" + user.email);
              }
            } else {
              const folderObj = await recursiveGetFolder(user.uploaded, _id);
              uploadedObj.folderPath = folderObj.folderPath + "/" + name;
              updatedArray = await getUpdatedArray(
                  user.uploaded,
                  _id,
                  uploadedObj,
              );
            }

            if (uploadedObj.folderPath == "") {
              request.session.status = "error";
              request.session.message = "Folder name must not be empty.";
              result.redirect("/MyUploads");
              return false;
            }

            if (fileSystem.existsSync(uploadedObj.folderPath)) {
              request.session.status = "error";
              request.session.message =
              "Folder with the same name already exists.";
              result.redirect("/MyUploads");
              return false;
            }
            fileSystem.mkdirSync(uploadedObj.folderPath);
            if (_id == "") {
              await database.collection("users").updateOne(
                  {
                    _id: ObjectId(request.session.user._id),
                  },
                  {
                    $push: {
                      uploaded: uploadedObj,
                    },
                  },
              );
            } else {
              for (let a = 0; a < updatedArray.length; a++) {
                updatedArray[a]._id = ObjectId(updatedArray[a]._id);
              }
              await database.collection("users").updateOne(
                  {
                    _id: ObjectId(request.session.user._id),
                  },
                  {
                    $set: {
                      uploaded: updatedArray,
                    },
                  },
              );
            }
            result.redirect("/MyUploads/" + _id);
            return false;
          }
          result.redirect("/Login");
        });

        app.get("/Admin", async (request, result) => {
        // render an HTML page with number of pages, and posts data
          result.render("Admin", {
            request: request,
          });
        });

        // search files or folders
        app.get("/Search", async (request, result) => {
          const search = request.query.search;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });
            const fileUploaded = await recursiveSearch(user.uploaded, search);
            const fileShared = await recursiveSearchShared(
                user.sharedWithMe,
                search,
            );

            // check if file is uploaded or shared with user
            if (fileUploaded == null && fileShared == null) {
              request.status = "error";
              request.message =
              "File/folder '" +
              search +
              "' is neither uploaded nor shared with you.";

              result.render("Search", {
                request: request,
              });
              return false;
            }

            const file = fileUploaded == null ? fileShared : fileUploaded;
            file.isShared = fileUploaded == null;
            result.render("Search", {
              request: request,
              file: file,
            });

            return false;
          }

          result.redirect("/Login");
        });

        app.get("/Blog", async (request, result) => {
        // render an HTML page with number of pages, and posts data
          result.render("Blog", {
            request: request,
          });
        });

        // get all files shared with logged-in user
        app.get("/SharedWithMe/:_id?", async (request, result) => {
          const _id = request.params._id;
          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });
            let files = null;
            let folderName = "";
            if (typeof _id == "undefined") {
              files = user.sharedWithMe;
            } else {
              const folderObj = await recursiveGetSharedFolder(
                  user.sharedWithMe,
                  _id,
              );
              if (folderObj == null) {
                request.status = "error";
                request.message = "Folder not found";
                result.render("Error", {
                  request: request,
                });
                return false;
              }

              files = folderObj.files;
              folderName = folderObj.folderName;
            }

            if (files == null) {
              request.status = "error";
              request.message = "Directory not found.";
              result.render("Error", {
                request: request,
              });
              return false;
            }
            result.render("SharedWithMe", {
              request: request,
              files: files,
              _id: _id,
              folderName: folderName,
            });
            return false;
          }
          result.redirect("/Login");
        });

        app.post("/DeleteLink", async (request, result) => {
          const _id = request.fields._id;

          if (request.session.user) {
            const link = await database.collection("public_links").findOne({
              $and: [
                {
                  "uploadedBy._id": ObjectId(request.session.user._id),
                },
                {
                  _id: ObjectId(_id),
                },
              ],
            });

            if (link == null) {
              request.session.status = "error";
              request.session.message = "Link does not exists.";

              const backURL = request.header("Referer") || "/";
              result.redirect(backURL);
              return false;
            }

            await database.collection("public_links").deleteOne({
              $and: [
                {
                  "uploadedBy._id": ObjectId(request.session.user._id),
                },
                {
                  _id: ObjectId(_id),
                },
              ],
            });

            request.session.status = "success";
            request.session.message = "Link has been deleted.";

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }

          result.redirect("/Login");
        });

        app.get("/MySharedLinks", async (request, result) => {
          if (request.session.user) {
            const links = await database
                .collection("public_links")
                .find({
                  "uploadedBy._id": ObjectId(request.session.user._id),
                })
                .toArray();

            result.render("MySharedLinks", {
              request: request,
              links: links,
            });
            return false;
          }

          result.redirect("/Login");
        });

        app.get("/SharedViaLink/:hash", async (request, result) => {
          const hash = request.params.hash;

          const link = await database.collection("public_links").findOne({
            hash: hash,
          });

          if (link == null) {
            request.session.status = "error";
            request.session.message = "Link expired.";

            result.render("SharedViaLink", {
              request: request,
            });
            return false;
          }

          result.render("SharedViaLink", {
            request: request,
            link: link,
          });
        });

        app.post("/ShareViaLink", async (request, result) => {
          const _id = request.fields._id;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });
            let file = await recursiveGetFile(user.uploaded, _id);
            const folder = await recursiveGetFolder(user.uploaded, _id);

            if (file == null && folder == null) {
              request.session.status = "error";
              request.session.message = "File does not exists";

              const backURL = request.header("Referer") || "/";
              result.redirect(backURL);
              return false;
            }

            if (folder != null) {
              folder.name = folder.folderName;
              folder.folderPath = folder.folderPath;
              delete folder.files;
              file = folder;
            }

            bcrypt.hash(file.name, 10, async (error, hash) => {
              hash = hash.substring(10, 20);
              const link = mainURL + "/SharedViaLink/" + hash;
              await database.collection("public_links").insertOne({
                hash: hash,
                file: file,
                uploadedBy: {
                  _id: user._id,
                  name: user.name,
                  email: user.email,
                },
                createdAt: new Date().getTime(),
              });

              request.session.status = "success";
              request.session.message = "Share link: " + link;

              const backURL = request.header("Referer") || "/";
              result.redirect(backURL);
            });

            return false;
          }

          result.redirect("/Login");
        });

        // Delete Directory

        app.post("/DeleteDirectory", async (request, result) => {
          const _id = request.fields._id;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            const updatedArray = await removeFolderReturnUpdated(
                user.uploaded,
                _id,
            );
            for (let a = 0; a < updatedArray.length; a++) {
              updatedArray[a]._id = ObjectId(updatedArray[a]._id);
            }

            await database.collection("users").updateOne(
                {
                  _id: ObjectId(request.session.user._id),
                },
                {
                  $set: {
                    uploaded: updatedArray,
                  },
                },
            );

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }
          result.redirect("/Login");
        });
        // delete uploaded file
        app.post("/DeleteFile", async (request, result) => {
          const _id = request.fields._id;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            const updatedArray = await removeFileReturnUpdated(
                user.uploaded,
                _id,
            );
            for (let a = 0; a < updatedArray.length; a++) {
              updatedArray[a]._id = ObjectId(updatedArray[a]._id);
            }

            await database.collection("users").updateOne(
                {
                  _id: ObjectId(request.session.user._id),
                },
                {
                  $set: {
                    uploaded: updatedArray,
                  },
                },
            );

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }

          result.redirect("/Login");
        });

        // rename file
        app.post("/RenameFile", async (request, result) => {
          const _id = request.fields._id;
          const name = request.fields.name;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            const updatedArray = await renameFileReturnUpdated(
                user.uploaded,
                _id,
                name,
            );
            for (let a = 0; a < updatedArray.length; a++) {
              updatedArray[a]._id = ObjectId(updatedArray[a]._id);
            }
            await database.collection("users").updateOne(
                {
                  _id: ObjectId(request.session.user._id),
                },
                {
                  $set: {
                    uploaded: updatedArray,
                  },
                },
            );

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }
          result.redirect("/Login");
        });

        // rename folder
        app.post("/RenameFolder", async (request, result) => {
          const _id = request.fields._id;
          const name = request.fields.name;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            const updatedArray = await renameFolderReturnUpdated(
                user.uploaded,
                _id,
                name,
            );

            for (let a = 0; a < updatedArray.length; a++) {
              updatedArray[a]._id = ObjectId(updatedArray[a]._id);
            }
            await database.collection("users").updateOne(
                {
                  _id: ObjectId(request.session.user._id),
                },
                {
                  $set: {
                    uploaded: updatedArray,
                  },
                },
            );

            const backURL = request.header("Referer") || "/";
            result.redirect(backURL);
            return false;
          }
          result.redirect("/Login");
        });

        // download file
        app.post("/DownloadFile", async (request, result) => {
          const _id = request.fields._id;

          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });
            const fileUploaded = await recursiveGetFile(user.uploaded, _id);
            const fileShared = await recursiveGetSharedFile(
                user.sharedWithMe,
                _id,
            );

            if (fileUploaded == null && fileShared == null) {
              result.json({
                status: "error",
                message: "File is neither uploaded nor shared With you.",
              });
              return false;
            }
            const file = fileUploaded == null ? fileShared : fileUploaded;
            fileSystem.readFile(file.filePath, (error, data) => {
              result.json({
                status: "success",
                message: "Data has been fetched.",
                arrayBuffer: data,
                fileType: file.type,
                // "file": mainURL + "/" + file.filePath,
                fileName: file.name,
              });
            });
            return false;
          }

          result.json({
            status: "error",
            message: "Please login to perform this action.",
          });
          return false;
        });

        // view all files uploaded by logged-in user
        app.get("/MyUploads", async (request, result) => {
          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });

            const uploaded = user.uploaded;

            result.render("MyUploads", {
              request: request,
              folderName: folderName,
              createdAt: createdAt, // pass createdAt variable to view
              uploaded: uploaded, // pass uploaded variable to viewuploaded: uploaded,
            });
            return false;
          }

          result.redirect("/Login");
        });

        // upload new file
        app.post("/UploadFile", async (request, result) => {
          if (request.session.user) {
            const user = await database.collection("users").findOne({
              _id: ObjectId(request.session.user._id),
            });
            if (request.files.file.size > 0) {
              const _id = request.fields._id;

              const uploadedObj = {
                _id: ObjectId(),
                size: request.files.file.size, // in bytes
                name: request.files.file.name,
                type: request.files.file.type,
                filePath: "",
                createdAt: new Date().getTime(),
              };
              let filePath = "";
              // if it is the root path
              if (_id == "") {
                filePath =
                "public/uploads/" +
                user.email +
                "/" +
                new Date().getTime() +
                "-" +
                request.files.file.name;
                uploadedObj.filePath = filePath;

                if (!fileSystem.existsSync("public/uploads/" + user.email)) {
                  fileSystem.mkdirSync("public/uploads/" + user.email);
                }
                // Read the file
                fileSystem.readFile(request.files.file.path, (err, data) => {
                  if (err) throw err;
                  console.log("File read!");

                  // Write the file
                  fileSystem.writeFile(filePath, data, async (err) => {
                    if (err) throw err;
                    console.log("File written!");

                    await database.collection("users").updateOne(
                        {
                          _id: ObjectId(request.session.user._id),
                        },
                        {
                          $push: {
                            uploaded: uploadedObj,
                          },
                        },
                    );

                    result.redirect("/MyUploads/" + _id);
                  });

                  // Delete the file
                  fileSystem.unlink(request.files.file.path, (err) => {
                    if (err) throw err;
                    console.log("File deleted!");
                  });
                });
              } else {
              // if it is a folder
                const folderObj = await recursiveGetFolder(user.uploaded, _id);
                uploadedObj.filePath =
                folderObj.folderPath + "/" + request.files.file.name;

                const updatedArray = await getUpdatedArray(
                    user.uploaded,
                    _id,
                    uploadedObj,
                );
                // Read the file
                fileSystem.readFile(request.files.file.path, (err, data) => {
                  if (err) throw err;
                  console.log("File read!");

                  // Write the file
                  fileSystem.writeFile(
                      uploadedObj.filePath,
                      data,
                      async (err) => {
                        if (err) throw err;
                        console.log("File written!");

                        for (let a = 0; a < updatedArray.length; a++) {
                          updatedArray[a]._id = ObjectId(updatedArray[a]._id);
                        }

                        await database.collection("users").updateOne(
                            {
                              _id: ObjectId(request.session.user._id),
                            },
                            {
                              $set: {
                                uploaded: updatedArray,
                              },
                            },
                        );

                        result.redirect("/MyUploads/" + _id);
                      },
                  );

                  // Delete the file
                  fileSystem.unlink(request.files.file.path, (err) => {
                    if (err) throw err;
                    console.log("File deleted!");
                  });
                });
              }
            } else {
              request.status = "error";
              request.message = "Please select valid image.";

              result.render("/MyUploads", {
                request: request,
              });
            }
            return false;
          }
          result.redirect("/Login");
        });

        // logout the user
        app.get("/Logout", (request, result) => {
          request.session.destroy();
          result.redirect("/");
        });

        // show page to login
        app.get("/Login", (request, result) => {
          result.render("Login", {
            request: request,
          });
        });

        app.get("/Register", (request, result) => {
          result.render("Register", {
            request: request,
          });
        });

        // register the user
        app.post("/Register", async (request, result) => {
          const name = request.fields.name;
          const email = request.fields.email;
          const password = request.fields.password;
          const reset_token = "";
          const isVerified = false;
          const verification_token = new Date().getTime();

          const user = await database.collection("users").findOne({
            email: email,
          });

          if (user == null) {
            bcrypt.hash(password, 10, async (error, hash) => {
              await database.collection("users").insertOne(
                  {
                    name: name,
                    email: email,
                    password: hash,
                    reset_token: reset_token,
                    uploaded: [],
                    sharedWithMe: [],
                    isVerified: isVerified,
                    verification_token: verification_token,
                  },
                  async (error, data) => {
                    const transporter =
                  nodemailer.createTransport(nodemailerObject);
                    const text =
                  "Please verify your account by clicking the following link: " +
                  mainURL +
                  "/verifyEmail/" +
                  email +
                  "/" +
                  verification_token;

                    const html =
                  "Please verify your account by clicking the following link: <br><br><a href='" +
                  mainURL +
                  "/verifyEmail/" +
                  email +
                  "/" +
                  verification_token +
                  "'>Confirm Email </a><br><br> Thank you. ";
                    await transporter.sendMail(
                        {
                          from: nodemailerFrom,
                          to: email,
                          subject: "Email Verification",
                          text: text,
                          html: html,
                        },
                        (error, info) => {
                          if (error) {
                            console.log(error);
                          } else {
                            console.log("Email sent" + info.response);
                          }
                          request.status = "success";
                          request.message =
                      "Signed up successfully. An email has been sent to verify your account. Once verified, you will be able to  login and start using your file transfer app.";

                          result.render("Register", {
                            request: request,
                          });
                        },
                    );
                  },
              );
            });
          } else {
            request.status = "error";
            request.message = "Email already exist.";

            result.render("Register", {
              request: request,
            });
          }
        });

        app.get(
            "/verifyEmail/:email/:verification_token",
            async (request, result) => {
              const email = request.params.email;
              const verification_token = request.params.verification_token;

              const user = await database.collection("users").findOne({
                $and: [
                  {},
                  {
                    verification_token: parseInt(verification_token),
                  },
                ],
              });

              if (user == null) {
                request.status = "error";
                request.message =
              "Email does not exist. Or verification link is expired.";
                result.render("Login", {request: request});
              } else {
                await database.collection("users").findOneAndUpdate(
                    {
                      $and: [
                        {
                          email: email,
                        },
                        {
                          verification_token: parseInt(verification_token),
                        },
                      ],
                    },
                    {
                      $set: {
                        verification_token: "",
                        isVerified: true,
                      },
                    },
                );
                request.status = "sucess";
                request.message = "Account has been verified. Please try login ";
                result.render("Login", {
                  request: request,
                });
              }
            },
        );

        // authenticate the user
        app.post("/Login", async (request, result) => {
          const email = request.fields.email;
          const password = request.fields.password;

          const user = await database.collection("users").findOne({
            email: email,
          });

          if (user == null) {
            request.status = "error";
            request.message = "Email does not exist.";
            result.render("Login", {
              request: request,
            });

            return false;
          }

          bcrypt.compare(password, user.password, (error, isVerify) => {
            if (isVerify) {
              if (user.isVerified) {
                request.session.user = user;
                result.redirect("/");

                return false;
              }
              request.status = "error";
              request.message = "Kindly verify your email.";
              result.render("Login", {
                request: request,
              });
              return false;
            }

            request.status = "error";
            request.message = "Password is not correct.";
            result.render("Login", {
              request: request,
            });
          });
        });

        app.get("/ForgotPassword", (request, result) => {
          result.render("ForgotPassword", {
            request: request,
          });
        });

        app.post("/SendRecoveryLink", async (request, result) => {
          const email = request.fields.email;
          const user = await database.collection("users").findOne({
            email: email,
          });

          if (user == null) {
            request.status = "error";
            request.message = "Email does not exist.";
            result.render("ForgotPassword", {
              request: request,
            });

            return false;
          }

          const reset_token = new Date().getTime();
          await database.collection("users").findOneAndUpdate(
              {
                email: email,
              },
              {
                $set: {
                  reset_token: reset_token,
                },
              },
          );
          const transporter = nodemailer.createTransport(nodemailerObject);
          const text =
          "Please click the following link to reset your password: " +
          mainURL +
          "/ResetPassword/" +
          email +
          "/" +
          reset_token;

          const html =
          "Please click the following link to reset your password: <br><br><a href='" +
          mainURL +
          "/ResetPassword/" +
          email +
          "/" +
          reset_token +
          "'>Reset Password </a><br><br> Thank you. ";
          await transporter.sendMail(
              {
                from: nodemailerFrom,
                to: email,
                subject: "Reset Password",
                text: text,
                html: html,
              },
              (error, info) => {
                if (error) {
                  console.log(error);
                } else {
                  console.log("Email sent" + info.response);
                }
                request.status = "success";
                request.message =
              "An email has been sent with the link to recover your password ";

                result.render("ForgotPassword", {
                  request: request,
                });
              },
          );
        });

        app.get("/ResetPassword/:email/:reset_token", async (request, result) => {
          const email = request.params.email;
          const reset_token = request.params.reset_token;

          const user = await database.collection("users").findOne({
            $and: [
              {
                reset_token: parseInt(reset_token),
              },
            ],
          });

          if (user == null) {
            request.status = "error";
            request.message = "Link is expired.";
            result.render("Error", {request: request});
            return false;
          }
          result.render("ResetPassword", {
            request: request,
            email: email,
            reset_token: reset_token,
          });
        });
        // Reset Password

        app.post("/ResetPassword", async (request, result) => {
          const email = request.fields.email;
          const reset_token = request.fields.reset_token;
          const new_password = request.fields.new_password;
          const confirm_password = request.fields.confirm_password;

          if (new_password != confirm_password) {
            request.status = "error";
            request.message = "Password does not match.";

            result.render("ResetPassword", {
              request: request,
              email: email,
              reset_token: reset_token,
            });
            return false;
          }

          const user = await database.collection("users").findOne({
            $and: [
              {
                email: email,
              },
              {
                reset_token: parseInt(reset_token),
              },
            ],
          });

          if (user == null) {
            request.status = "error";
            request.message = "Email does not exist. Or recovery link is expired";

            result.render("ResetPassword", {
              request: request,
              email: email,
              reset_token: reset_token,
            });
            return false;
          }
          bcrypt.hash(new_password, 10, async (error, hash) => {
            await database.collection("users").findOneAndUpdate(
                {
                  $and: [
                    {
                      email: email,
                    },
                    {
                      reset_token: parseInt(reset_token),
                    },
                  ],
                },
                {
                  $set: {
                    reset_token: "",
                    password: hash,
                  },
                },
            );
            request.status = "success";
            request.message =
            "Password has been changed. Please try login again.";
            result.render("Login", {
              request: request,
            });
          });
        });
        // home page
        app.get("/", (request, result) => {
          result.render("index", {
            request: request,
          });
        });
      },
  );
});

