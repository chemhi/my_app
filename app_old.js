var express = require('express');
var path = require('path');
var app = express();
var mongoose = require('mongoose');
var passport = require('passport');
var session = require('express-session');
var flash = require('connect-flash');
var async = require('async');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');


// connect database
mongoose.connect(process.env.MONGO_DB);
var db = mongoose.connection;
db.once("open",function(){
  console.log("DB connected!");
});
db.on("error",function(err){
  console.log("DB ERROR :", err);
});

// model setting
var postSchema = mongoose.Schema({
  title: {type:String, required:true},
  body: {type:String, required:true},
  author: {type:mongoose.Schema.Types.ObjectId, ref:'user', required:true },
  createdAt:{type:Date, default:Date.now},
  updatedAt:Date
});
var Post = mongoose.model('post',postSchema);

var bcrypt = require("bcrypt-nodejs");
var userSchema = mongoose.Schema({
  email: {type:String, required:true, unique:true},
  nickname: {type:String, required:true, unique:true},
  password: {type:String, required:true},
  createdAt: {type:String, default:Date.now}
});
userSchema.pre("save", function (next){
  var user = this;
  if(!user.isModified("password")){
    return next();
  } else {
    user.password =bcrypt.hashSync(user.password);
    return next();
  }
});
userSchema.methods.authenticate = function (password) {
  var user = this;
  return bcrypt.compareSync(password,user.password);
};
userSchema.methods.hash = function (password) {
  return bcrypt.hashSync(password);
};

var User = mongoose.model('user',userSchema);

// view setting
app.set("view engine", 'ejs');

// set middlewares
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));
app.use(methodOverride("_method"));
app.use(flash());

app.use(session({secret:'MySecret'}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done){
  done(null, user.id);
});
passport.deserializeUser(function(id, done){
  User.findById(id, function(err, user){
    done(err, user);
  });
});

var LocalStrategy = require('passport-local').Strategy;
passport.use('local-login',
  new LocalStrategy({
    usernameField : 'email',
    passwordField : 'password',
    passReqToCallback : true
    },
    function(req, email, password, done){
      User.findOne({'email': email}, function(err, user){
        if (err) return done(err);
        if(!user){
          req.flash('email', req.body.email);
          return done(null, false, req.flash('loginError', 'No user found.'));
        }
        if (!user.authenticate(password)){
          req.flash('email', req.body.email);
          return done(null, false, req.flash('loginError', 'password does not Match.'));
        }
        return done(null, user);
      });
    }
  )
);// local strategy

// set home routes
app.get('/', function(req,res){
  res.redirect('/postings');
});
app.get('/login', function (req,res){
  res.render('login/login',{email:req.flash("email")[0], loginError:req.flash('loginError')});
});
app.post('/login',
  function(req,res,next){
    req.flash('email'); //flush email data
    if(req.body.email.length === 0 || req.body.password.length === 0){
      req.flash('email',req.body.email);
      req.flash("loginError","Please enter both email and password.");
      res.rediret('/login');
    } else {
      next();
    }
  }, passport.authenticate('local-login', {
    successRedirect : '/postings',
    failureRedirect : '/login',
    failureFlash : true
  })
);
app.get('/logout', function(req,res){
  req.logout();
  res.redirect('/');
});

//set user routes
app.get('/users/new',function(req,res){
  res.render('users/new', {
                            formData: req.flash('formData')[0],
                            emailError: req.flash('emailError')[0],
                            nicknameError: req.flash('nicknameError')[0],
                            passwordError: req.flash('passwordError')[0]
                          }
  );
}); //new users
app.post('/users', checkUserRegValidation, function(req,res,next){
  User.create(req.body.user, function (err,user){
    if(err) return res.json({success:false, message:err});
    res.redirect('/login');
  });
}); //create users
app.get('/users/:id', isLoggedIn, function(req,res){
  User.findById(req.params.id, function (err,user){
    if(err) return res.json({success:false, message:err});
    res.render("users/show",{user: user});
  });
}); //show users
app.get('/users/:id/edit', isLoggedIn, function(req,res){
  if(req.user._id != req.params.id) return res.json({success:false, message:"Unauthorized Attemp"});
  User.findById(req.params.id, function(err,user){
    if(err) return res.json({success:false, message:err});
    res.render('users/edit', {
                              user: user,
                              formData: req.flash('formData')[0],
                              emailError: req.flash('emailError')[0],
                              nicknameError: req.flash('nicknameError')[0],
                              passwordError: req.flash('passwordError')[0]
                            }
    );
  });
}); //edit users
app.put('/users/:id', isLoggedIn, checkUserRegValidation, function(req,res) {
  if(req.user._id != req.params.id) return res.json({success:false, message:"Unauthrized Attemp"});
  User.findById(req.params.id, req.body.user, function(err,user){
    if(err) return res.json({success:'false', message:err});
    if(user.authenticate(req.body.user.password)){
      if(req.body.user.newPassword){
        req.body.user.password = user.hash(req.body.user.newPassword);
        user.save();
      } else {
        delete req.body.user.password;
      }
    User.findByIdAndUpdate(req.params.id, req.body.user, function (err,user){
      if(err) return res.json({success:"false", message:err});
      res.redirect('/users/'+req.params.id);
    });
    } else {
      req.flash("formData", req.body.user);
      req.flash("passwordError","- Invalid password");
      res.redirect("/users/"+req.params.id+"/edit");
    }
  });
}); //update users

// set posts routes

app.get("/postings", function(req,res){
  Post.find({}).populate("author").sort('-createdAt').exec(function(err,posts){
    if(err) return res.json({success:false, message:err});
    res.render("posts/index", {posts:posts, user:req.user});
  });
}); // show posings' index

app.get("/postings/new", isLoggedIn,function(req,res){
  //console.log("Error Input formData ---");
  res.render("posts/new", {user:req.user});
}); // create new postings - 1st
app.post("/postings", isLoggedIn, function(req, res) {
  //console.log("Error Input formData 0");
  req.body.post.author=req.user._id;
  Post.create(req.body.post, function (err,post){
    //console.log("Error Input formData 1");
    if(err) return res.json({success:false, message:err});
    res.redirect("/postings");
  });
}); // create new postings - 2nd

app.get('/postings/:id', function (req, res){
  Post.findById(req.params.id).populate("author").exec(function (err, post){
    if(err) return res.json({success:false, message:err});
    res.render("posts/show", {post:post, user:req.user});
  });
}); // show private postings details

app.get('/postings/:id/edit', isLoggedIn, function(req, res){
  Post.findById(req.params.id, function(err, post){
    if(err) return res.json({success:false, message:err});
    if(!req.user._id.equals(post.author)) return res.json({success:false, message:"Unauthorized Attempt"});
    res.render("posts/edit", {post:post, user:req.user});
  });
}); // edit private postings
app.put('/postings/:id', isLoggedIn, function (req,res){
  req.body.post.updatedAt=Date.now();
  Post.findOneAndUpdate({_id:req.params.id, author:req.user._id}, req.body.post, function(err,post){
    if(err) return res.json({success:false, message:err});
    if(!post) return res.json({success:false, message:"No data found to update"});
    res.redirect("/postings/"+req.params.id);
  });
});//update private postings
app.delete('/postings/:id', isLoggedIn, function(req,res){
  Post.findOneAndRemove({_id:req.params.id, author:req.user._id}, function(err,post){
    if(err) return res.json({success:false, message:err});
    if(!post) return res.json({success:false, message:"No data found to delete"});
    res.redirect("/postings/");
  });
});//Destory private postings

//functions
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()){
    return next();
  }
  res.redirect('/');
}

function checkUserRegValidation(req, res, next) {
  var isValid = true;

  async.waterfall(
    [function(callback) {
      User.findOne({email: req.body.user.email, _id: {$ne: mongoose.Types.ObjectId(req.params.id)}},
        function (err, user){
          if(user){
            isValid = false;
            req.flash("emailError","- This email is already resistered.");
          }
          callback(null, isValid);
        }
      );
    }, function(isValid, callback){
      User.findOne({nickname: req.body.user.nickname, _id: {$ne: mongoose.Types.ObjectId(req.params.id)}},
        function(err,user){
          if(user){
            isValid = false;
            req.flash("nicknameError","- This nickname is already resistered.");
          }
          callback(null, isValid);
        }
      );
    }], function(err, isValid){
      if(err) return res.json({success:"false",message:err});
      if(isValid){
        return next();
      } else {
        req.flash("formData",req.body.user);
        res.redirect("back");
      }
    }
  );
}

// start server
app.listen(3000, function(){
  console.log('Server On!');
});
