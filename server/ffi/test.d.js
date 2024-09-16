module.exports = ({FFIType}) => ({
    file: 'test.c',
    types: {
        main: {
            returns: FFIType.cstring,
        },
    },
    wrapper({main}) {
        console.log(main());
    },
});
