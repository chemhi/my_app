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
  createdAt:{type:Date, default:Date.now},
  updatedAt:Date
});
var Post = mongoose.model('post',postSchema);

var userSchema = mongoose.Schema({
  email: {type:String, required:true, unique:true},
  nickname: {type:String, required:true, unique:true},
  password: {type:String, required:true},
  createdAt: {type:String, default:Date.now}
});
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
        if (user.password != password){
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
app.get('/user/:id', function(req,res){
  User.findById(req.params.id, function (err,user){
    if(err) return res.json({success:false, message:err});
    res.render("users/show",{user: user});
  });
}); //show users
app.get('/users/:id/edit', function(req,res){
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
app.put('/users/:id', checkUserRegValidation, function(req,res) {
  User.findById(req.params.id, req.body.user, function(err,user){
    if(err) return res.json({success:'false', message:err});
    if(req.body.user.password == user.password){
      if(req.body.user.newPassword){
        req.body.user.password=req.body.user.newPassword;
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
      res.redirect('/users/'+req.params.id+'/edit');
    }
  });
}); //update users

// set routes
app.post("/postings", function(req, res){
  Post.create(req.body.post, function(err, post){
    if(err) return res.json({success:false, message:err});
    res.json({success:true, data:post});
  });
}); // create
app.get("/postings", function(req,res){
  Post.find({}).sort('-createdAt').exec(function(err,posts){
    if(err) return res.json({success:false, message:err});
    res.render("posts/index", {data:posts, user:req.user});
  });
}); // index
app.get("/postings/new", function(req,res){
  res.render("posts/new");
}); // new
app.post("/postings", function(req, res) {
  console.log(req.body);
  Post.create(req.body.post,function(err,post){
    if(err) return res.json({success:false, message:err});
    res.redirect("/postings");
  });
});

app.get('/postings/:id', function (req, res){
  Post.findById(req.params.id, function(err, post){
    if(err) return res.json({success:false, message:err});
    res.render("posts/show", {data:post});
  });
}); // showing each other

app.get('/postings/:id/edit', function (req, res){
  Post.findById(req.params.id, function(err, post){
    if(err) return res.json({success:false, message:err});
    res.render("posts/edit", {data:post});
  });
}); // edit
app.put('/postings/:id', function (req,res){
  req.body.post.updatedAt=Date.now();
  Post.findByIdAndUpdate(req.params.id, req.body.post, function (err,post){
    if(err) return res.json({success:false, message:err});
    res.redirect("/postings/"+req.params.id);
    //res.json({sucess:true, message:post._id+" updated"});
  });
}); //update

app.delete('/postings/:id', function(req,res){
  Post.findByIdAndRemove(req.params.id, function (err,post){
    if(err) return res.json({success:false, message:err});
    res.redirect('/postings');
    //res.json({success:true, message:post._id+" deleted"});
  });
}); //destroy
/*
app.get('/', function (req, res){
  Data.findOne({name:"myData"},function(err,data){
    if(err) return console.log("Data ERROR:",err);
    data.count++;
    data.save(function(err){
      if(err) return console.log("Data ERROR:", err);
      res.render("my_first_ejs",data);
    });
  });
});
app.get('/reset', function (req, res){
  setCounter(res,0);
});
app.get('/set/count', function (req, res){
  if(req.params.num)  setCounter(res,req.params.num);
  else getCounter(res);
});
app.get('/set/:num', function (req, res){
  if(req.params.num)  setCounter(res,req.params.num);
  else getCounter(res);
});

function setCounter(res,num){
  console.log("setCounter");
  Data.findOne({name:"myData"},function(err,data){
    if(err) return console.log("Data ERROR:",err);
    data.count=num;
    data.save(function(err){
      if(err) return console.log("Data ERROR:",err);
      res.render("my_first_ejs",data);
    });
  });
}

function getCounter(res){
  console.log("getCounter");
  Data.findOne({name:"myData"},function(err,data){
    if(err) return console.log("Data ERROR:",err);
    res.render("my_first_ejs",data);
    });
}
*/
// start server
app.listen(3000, function(){
  console.log('Server On!');
});
