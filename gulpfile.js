'use strict';
var gulp        = require('gulp'),
    browserify  = require('browserify'),
    source      = require('vinyl-source-stream'),
    streamify   = require('gulp-streamify'),
    connect     = require('gulp-connect'),
    uglify      = require('gulp-uglify'),
    less        = require('gulp-less'),
    rename      = require('gulp-rename'),
    deploy      = require('gulp-gh-pages');

// bundle up our js
gulp.task('browserify', function(cb) {
    return browserify('./dev/js/app.js').bundle()
        .on('error', function(err){
            console.log(err.toString());
            this.emit('end');
        })
        .pipe(source('app.min.js'))
       // .pipe(streamify(uglify()))
        .pipe(gulp.dest('./dist/js'))
        .pipe(connect.reload());
});

// less/css tasks
gulp.task('less', function () {
    return gulp.src('dev/less/**/*.less')
        .pipe(less())
        .on('error', function (err) {
            console.log(err.toString());
            this.emit('end');
        })
        .pipe(gulp.dest('dist/styles/'))
        .pipe(connect.reload());
});

// Copy our markup over to dist
gulp.task('markup', function(){
    gulp.src('dev/*.html')
    .pipe(gulp.dest('./dist/'))
    .pipe(connect.reload());
});

// Gulp connect server
gulp.task('webserver', function(){
    return connect.server({
        root: './dist',
        livereload : true
    });
});

// watch for changes
gulp.task('watcher', function(){
    var markupWatcher = gulp.watch(['dev/*.html'], ['markup']);
        markupWatcher.on('change', function(event){
            console.log('file' + event.path + ' was ' + event.type + ', building markup...');
        });

    var jsWatcher = gulp.watch(['dev/**/*.js'], ['browserify']);
        jsWatcher.on('change', function(event){
            console.log('file' + event.path + ' was ' + event.type + ', building js...');
        });

    var lessWatcher = gulp.watch(['dev/**/*.less'], ['less']);
        lessWatcher.on('change', function(event){
            console.log('file' + event.path + ' was ' + event.type + ', building css...');
        });
});

// Deploy to gh pages
gulp.task('deploy', function () {
    gulp.src('./dist/**/*')
        .pipe(deploy());
});

gulp.task('default', ['watcher', 'webserver', 'browserify', 'less', 'markup']);